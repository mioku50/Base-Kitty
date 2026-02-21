import * as Phaser from "phaser";

const GAME_WIDTH = 400;
const PLATFORM_HEIGHT = 12;
const PLATFORM_WIDTH = 80;
const PLAYER_BOUNCE = -600;
const BOOST_BOUNCE = -1100;
const PLATFORM_SPACING_MIN = 60;
const PLATFORM_SPACING_MAX = 120;
const GRAVITY = 700;
const LOVE_SPEED = -700;
const ENEMY_PATROL_SPEED = 60;
const COLLECTABLE_SCORE = 50;
const ENEMY_SCORE = 100;

// Background stage thresholds (in score units)
const STAGE1_END = 500;
const STAGE2_END = 2000;

export default class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cloudsNormal!: Phaser.Physics.Arcade.StaticGroup;
  private cloudsBouncy!: Phaser.Physics.Arcade.StaticGroup;
  private cloudsFragile!: Phaser.Physics.Arcade.StaticGroup;
  private loves!: Phaser.Physics.Arcade.Group;
  private collectables!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private scoreText!: Phaser.GameObjects.Text;
  private score = 0;
  private highestY = 0;
  private nextPlatformY = 0;
  private bgImages: Phaser.GameObjects.Image[] = [];
  private isGameOver = false;
  private lastPointerX = GAME_WIDTH / 2;
  private targetX = GAME_WIDTH / 2;
  private pointerDown = false;
  private pointerDownTime = 0;
  private shootCooldownMs = 0;
  private bgStage = 0;
  private gameOverCallback?: (score: number) => void;
  private lastTapTime = 0;
  private readonly DOUBLE_TAP_THRESHOLD = 300;
  private hookUsed = false;
  private platformsSpawned = 0;

  constructor(onGameOver?: (score: number) => void) {
    super({ key: "GameScene" });
    this.gameOverCallback = onGameOver;
  }

  init(data: { onGameOver?: (score: number) => void }) {
    if (data?.onGameOver) {
      this.gameOverCallback = data.onGameOver;
    }
    this.score = 0;
    this.isGameOver = false;
    this.highestY = 0;
    this.bgStage = 0;
    this.hookUsed = false;
    this.lastTapTime = 0;
    this.platformsSpawned = 0;
  }

  create() {
    const height = this.scale.height;
    const width = this.scale.width;

    // Background images — parallax vertical scroll
    const bgKeys = ["bg-stage0", "bg-stage1", "bg-stage2"];
    bgKeys.forEach((key, i) => {
      const img = this.add.image(width / 2, height * 2, key)
        .setScrollFactor(0, 0.3)
        .setDisplaySize(width, height * 4)
        .setDepth(-10)
        .setVisible(i === 0);
      this.bgImages.push(img);
    });

    // Physics world bounds (very tall)
    this.physics.world.setBounds(0, -99999, width, 100000 + height);

    // Groups
    this.cloudsNormal = this.physics.add.staticGroup();
    this.cloudsBouncy = this.physics.add.staticGroup();
    this.cloudsFragile = this.physics.add.staticGroup();
    this.loves = this.physics.add.group();
    this.collectables = this.physics.add.group();
    this.enemies = this.physics.add.group();

    // Generate initial platforms
    this.nextPlatformY = height - 80;
    this.spawnStartingPlatform();
    for (let i = 0; i < 20; i++) {
      this.spawnPlatform();
    }

    // Player
    this.player = this.physics.add.sprite(width / 2, height - 120, "jump-up");
    // Scale to a target height of 64px, preserving aspect ratio
    this.player.setScale(64 / this.player.height);
    this.player.setBodySize(this.player.displayWidth * 0.6, this.player.displayHeight * 0.85);
    this.player.setCollideWorldBounds(false);
    this.player.setGravityY(GRAVITY);
    this.player.setDepth(5);
    this.highestY = this.player.y;

    // Add soft glow to player so it always stands out against dark backgrounds
    if (this.player.preFX) {
      this.player.preFX.addGlow(0xffccee, 6, 0, false, 0.1, 16);
    }

    // Camera
    this.cameras.main.setBounds(0, -99999, width, 100000 + height);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setFollowOffset(0, height * 0.3);

    // Colliders
    type PhysicsObj = Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile;
    const asSprite = (o: PhysicsObj) => o as unknown as Phaser.Physics.Arcade.Sprite;

    // Normal clouds — standard bounce
    this.physics.add.collider(
      this.player,
      this.cloudsNormal,
      (p) => { asSprite(p).setVelocityY(PLAYER_BOUNCE); },
      (p) => asSprite(p).body!.velocity.y >= 0,
      this
    );

    // Bouncy clouds — super bounce + rocket texture briefly
    this.physics.add.collider(
      this.player,
      this.cloudsBouncy,
      (p) => {
        asSprite(p).setVelocityY(BOOST_BOUNCE);
        asSprite(p).setTexture("rocket");
        asSprite(p).setScale(64 / asSprite(p).height);
      },
      (p) => asSprite(p).body!.velocity.y >= 0,
      this
    );

    // Fragile clouds — player falls through immediately, platform crumbles
    this.physics.add.collider(
      this.player,
      this.cloudsFragile,
      (_p, plat) => {
        const sprite = plat as Phaser.Physics.Arcade.Sprite;
        const ext = sprite as unknown as { crumbling?: boolean };
        if (!ext.crumbling) {
          ext.crumbling = true;
          // Give a tiny bounce so the player has a moment to react
          asSprite(_p).setVelocityY(PLAYER_BOUNCE * 0.3);
          // Fast crumble: fade out in 200ms
          this.tweens.add({
            targets: sprite,
            alpha: 0,
            duration: 200,
            ease: 'Power2.easeOut',
            onComplete: () => {
              if (sprite.active) sprite.destroy();
            },
          });
        }
      },
      (p) => asSprite(p).body!.velocity.y >= 0,
      this
    );

    this.physics.add.overlap(
      this.loves,
      this.enemies,
      (love, enemy) => {
        (love as Phaser.GameObjects.GameObject).destroy();
        this.spawnCollectable(asSprite(enemy).x, asSprite(enemy).y);
        (enemy as Phaser.GameObjects.GameObject).destroy();
        this.addScore(ENEMY_SCORE);
      },
      undefined,
      this
    );
    this.physics.add.overlap(
      this.player,
      this.collectables,
      (_p, sphere) => {
        (sphere as Phaser.GameObjects.GameObject).destroy();
        this.addScore(COLLECTABLE_SCORE);
      },
      undefined,
      this
    );
    this.physics.add.overlap(
      this.player,
      this.enemies,
      (player, enemy) => {
        const p = asSprite(player);
        const e = asSprite(enemy);
        if (p.body!.velocity.y > 0 && p.y < e.y - 10) {
          p.setVelocityY(PLAYER_BOUNCE);
          (e as Phaser.GameObjects.GameObject).destroy();
          this.addScore(ENEMY_SCORE);
        } else {
          this.triggerGameOver();
        }
      },
      undefined,
      this
    );

    // Score HUD (fixed to camera)
    this.scoreText = this.add
      .text(12, 12, "Score: 0", {
        fontSize: "18px",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setScrollFactor(0)
      .setDepth(20);

    // Input
    this.input.on("pointerdown", this.onPointerDown, this);
    this.input.on("pointermove", this.onPointerMove, this);
    this.input.on("pointerup", this.onPointerUp, this);

    this.targetX = width / 2;
    this.lastPointerX = width / 2;
  }

  // ─── Input handlers ──────────────────────────────────────────────────────────

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    this.pointerDown = true;
    this.pointerDownTime = this.time.now;
    this.lastPointerX = pointer.x;
    this.targetX = pointer.x;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (this.pointerDown) {
      this.targetX = pointer.x;
      this.lastPointerX = pointer.x;
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer) {
    const duration = this.time.now - this.pointerDownTime;
    const dx = Math.abs(pointer.x - this.lastPointerX);

    if (duration < 200 && dx < 20) {
      // It's a tap — check for double tap
      const now = this.time.now;
      if (now - this.lastTapTime < this.DOUBLE_TAP_THRESHOLD) {
        this.shootLove();
        this.lastTapTime = 0; // reset
      } else {
        this.lastTapTime = now;
      }
    }
    this.pointerDown = false;
  }

  // ─── Shooting ─────────────────────────────────────────────────────────────

  private shootLove() {
    if (this.isGameOver) return;
    if (this.shootCooldownMs > 0) return;
    const love = this.loves.create(
      this.player.x,
      this.player.y - 30,
      "love"
    ) as Phaser.Physics.Arcade.Sprite;
    love.setScale(32 / Math.max(love.width, love.height));
    love.setVelocityY(LOVE_SPEED);
    love.setGravityY(-GRAVITY); // neutralise gravity so projectile flies straight
    love.setDepth(4);
    this.shootCooldownMs = 400;
  }

  // ─── Spawning helpers ─────────────────────────────────────────────────────

  private spawnStartingPlatform() {
    const width = this.scale.width;
    const height = this.scale.height;
    const plat = this.cloudsNormal.create(
      width / 2,
      height - 60,
      "cloud-normal"
    ) as Phaser.Physics.Arcade.Sprite;
    plat.setDisplaySize(180, 55);
    plat.setSize(180 * 0.75, 10);
    plat.setOffset(180 * 0.125, 4);
    plat.refreshBody();
    plat.setDepth(2);
    this.platformsSpawned++;
  }

  private spawnPlatform() {
    const width = this.scale.width;
    const rand = Phaser.Math.Between;

    // Dynamic difficulty based on score
    let spacingMin: number;
    let spacingMax: number;
    let platformDisplayWidth: number;
    let fragileChance: number;
    let enemyChance: number;
    let collectableChance: number;

    if (this.score < 500) {
      // Stage 0: Easy start
      spacingMin = 55;
      spacingMax = 90;
      platformDisplayWidth = 130;
      fragileChance = 0;
      enemyChance = 0;
      collectableChance = 0.30;
    } else if (this.score < 1500) {
      // Stage 1: Medium
      spacingMin = 70;
      spacingMax = 110;
      platformDisplayWidth = 120;
      fragileChance = 0.12;
      enemyChance = 0.12;
      collectableChance = 0.22;
    } else {
      // Stage 2: Hard
      spacingMin = 90;
      spacingMax = 140;
      platformDisplayWidth = 100;
      fragileChance = 0.20;
      enemyChance = 0.20;
      collectableChance = 0.18;
    }

    const x = rand(PLATFORM_WIDTH / 2 + 10, width - PLATFORM_WIDTH / 2 - 10);
    const spacing = rand(spacingMin, spacingMax);
    this.nextPlatformY -= spacing;
    const y = this.nextPlatformY;

    const roll = Math.random();
    let platformKey: string;
    let isFragile = false;
    let isBouncy = false;

    if (roll < 0.10) {
      platformKey = "cloud-bouncy";
      isBouncy = true;
    } else if (roll < 0.10 + fragileChance) {
      platformKey = "cloud-fragile";
      isFragile = true;
    } else {
      platformKey = "cloud-normal";
    }

    const group = isBouncy ? this.cloudsBouncy : isFragile ? this.cloudsFragile : this.cloudsNormal;
    const plat = group.create(x, y, platformKey) as Phaser.Physics.Arcade.Sprite;
    const dw = isBouncy ? platformDisplayWidth + 20 : platformDisplayWidth;
    const dh = isBouncy ? 50 : 45;
    plat.setDisplaySize(dw, dh);
    plat.setSize(dw * 0.75, 10);
    plat.setOffset(dw * 0.125, 4);
    plat.refreshBody();
    plat.setDepth(2);

    if (isFragile) {
      // Always spawn a guaranteed safe normal cloud nearby
      const safeOffset = Phaser.Math.Between(80, 140) * Phaser.Math.RND.pick([1, -1]);
      const safeX = Phaser.Math.Clamp(x + safeOffset, PLATFORM_WIDTH / 2 + 10, width - PLATFORM_WIDTH / 2 - 10);
      const safePlat = this.cloudsNormal.create(safeX, y, "cloud-normal") as Phaser.Physics.Arcade.Sprite;
      safePlat.setDisplaySize(platformDisplayWidth, 45);
      safePlat.setSize(platformDisplayWidth * 0.75, 10);
      safePlat.setOffset(platformDisplayWidth * 0.125, 4);
      safePlat.refreshBody();
      safePlat.setDepth(2);
    }

    // Spawn enemy or collectable on normal platforms
    this.platformsSpawned++;
    if (platformKey === "cloud-normal" && Math.random() < enemyChance && this.platformsSpawned > 15) {
      this.spawnEnemy(x, y);
    } else if (platformKey === "cloud-normal" && Math.random() < collectableChance) {
      this.spawnCollectable(x, y - 20);
    }
  }

  private spawnCollectable(x: number, y: number) {
    const sphere = this.collectables.create(
      x,
      y,
      "base-sphere"
    ) as Phaser.Physics.Arcade.Sprite;
    sphere.setScale(32 / Math.max(sphere.width, sphere.height));
    sphere.setGravityY(-GRAVITY); // float in place
    sphere.setDepth(3);
  }

  private spawnEnemy(x: number, y: number) {
    const bear = this.enemies.create(x, y - 28, "fud-bear") as Phaser.Physics.Arcade.Sprite;
    bear.setScale(56 / Math.max(bear.width, bear.height));
    const bw = bear.displayWidth * 0.65;
    const bh = bear.displayHeight * 0.75;
    bear.setBodySize(bw, bh);
    bear.setOffset((bear.displayWidth - bw) / 2, (bear.displayHeight - bh) / 2);
    bear.setGravityY(-GRAVITY);
    bear.setVelocityX(ENEMY_PATROL_SPEED);
    bear.setDepth(3);
  }

  // ─── Score helpers ────────────────────────────────────────────────────────

  private addScore(pts: number) {
    this.score += pts;
    this.scoreText.setText(`Score: ${this.score}`);
    this.checkBackgroundStage();
  }

  private checkBackgroundStage() {
    const newStage =
      this.score >= STAGE2_END ? 2 : this.score >= STAGE1_END ? 1 : 0;
    if (newStage !== this.bgStage) {
      this.bgStage = newStage;
      this.bgImages.forEach((img, i) => img.setVisible(i === newStage));
    }
  }

  // ─── Game Over ────────────────────────────────────────────────────────────

  private triggerGameOver() {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.physics.pause();
    this.player.setTexture("game-over");

    // Notify React layer
    if (this.gameOverCallback) {
      this.time.delayedCall(600, () => {
        this.gameOverCallback!(this.score);
      });
    }
  }

  // ─── Update loop ──────────────────────────────────────────────────────────

  update(_time: number, delta: number) {
    if (this.isGameOver) return;

    // Smooth horizontal movement following pointer
    const lerpFactor = 0.12;
    const currentX = this.player.x;
    const dx = this.targetX - currentX;
    this.player.x += dx * lerpFactor;

    // Screen wrap horizontal
    if (this.player.x < -10) this.player.x = this.scale.width + 10;
    if (this.player.x > this.scale.width + 10) this.player.x = -10;

    // Shoot cooldown
    if (this.shootCooldownMs > 0) {
      this.shootCooldownMs -= delta;
    }

    // Player texture based on velocity
    if (!this.isGameOver) {
      if (this.player.body!.velocity.y < -50) {
        if (this.player.texture.key !== "rocket") {
          this.player.setTexture("jump-up");
          this.player.setScale(64 / this.player.height);
        }
      } else if (this.player.body!.velocity.y > 50) {
        this.player.setTexture("fall-down");
        this.player.setScale(64 / this.player.height);
      } else {
        this.player.setTexture("idle");
        this.player.setScale(64 / this.player.height);
      }
    }

    // Track highest point and add score
    if (this.player.y < this.highestY) {
      const deltaY = this.highestY - this.player.y;
      this.highestY = this.player.y;
      this.addScore(Math.floor(deltaY * 0.1));
    }

    // Generate more platforms ahead
    const cameraTop = this.cameras.main.scrollY;
    while (this.nextPlatformY > cameraTop - 200) {
      this.spawnPlatform();
    }

    const cameraBottom = this.cameras.main.scrollY + this.scale.height;

    // Remove clouds far below camera
    [this.cloudsNormal, this.cloudsBouncy, this.cloudsFragile].forEach((group) => {
      group.getChildren().forEach((p) => {
        const sprite = p as Phaser.Physics.Arcade.Sprite;
        if (sprite.y > cameraBottom + 200) {
          sprite.destroy();
        }
      });
    });

    // Remove loves that go off screen
    this.loves.getChildren().forEach((l) => {
      const sprite = l as Phaser.Physics.Arcade.Sprite;
      if (sprite.y < cameraTop - 100) sprite.destroy();
    });

    // Remove collectables that fall below screen
    this.collectables.getChildren().forEach((c) => {
      const sprite = c as Phaser.Physics.Arcade.Sprite;
      if (sprite.y > cameraBottom + 200) sprite.destroy();
    });

    // Update enemy patrol
    this.enemies.getChildren().forEach((e) => {
      const enemy = e as Phaser.Physics.Arcade.Sprite;
      // Reverse patrol direction at screen edges
      if (enemy.x < 20 || enemy.x > this.scale.width - 20) {
        enemy.setVelocityX(-enemy.body!.velocity.x);
      }
      if (enemy.y > cameraBottom + 200) {
        enemy.destroy();
      }
    });

    // Game over if player falls below camera bottom
    if (this.player.y > cameraBottom + 60) {
      this.triggerGameOver();
    }
  }
}
