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
const ENEMY_PATROL_SPEED = 55;
const CANDLE_SPEED = 350;
const CANDLE_INTERVAL_BASE = 2500;  // ms
const CANDLE_INTERVAL_MIN = 1000;   // ms floor
const COLLECTABLE_SCORE = 50;
const ENEMY_SCORE = 100;
// Cloud drift speeds per stage (min, max)
const CLOUD_DRIFT_SPEEDS = [
  { min: 15, max: 30 },  // Stage 0: slow
  { min: 30, max: 55 },  // Stage 1: medium
  { min: 55, max: 85 },  // Stage 2: fast
];

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
  private candles!: Phaser.Physics.Arcade.Group;
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
      const img = this.add.image(width / 2, height / 2, key)
        .setScrollFactor(0)
        .setDisplaySize(width, height)
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
    this.candles = this.physics.add.group();

    // Generate initial platforms
    this.nextPlatformY = height - 80;
    this.spawnStartingPlatform();
    for (let i = 0; i < 20; i++) {
      this.spawnPlatform();
    }

    // Player
    this.player = this.physics.add.sprite(width / 2, height - 120, "jump-up");
    // Scale to a target height of 85px, preserving aspect ratio
    this.player.setScale(85 / this.player.height);
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
        asSprite(p).setScale(85 / asSprite(p).height);
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

    // Heart hits bear -> bear destroyed, +50 score
    this.physics.add.overlap(
      this.loves,
      this.enemies,
      (love, enemy) => {
        (love as Phaser.GameObjects.GameObject).destroy();
        const e = asSprite(enemy);
        // Cancel candle timer before destroying
        const timer = e.getData('candleTimer') as Phaser.Time.TimerEvent | undefined;
        if (timer) timer.remove(false);
        this.spawnCollectable(e.x, e.y);
        (enemy as Phaser.GameObjects.GameObject).destroy();
        this.addScore(50);
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
    // Any contact with bear = Game Over
    this.physics.add.overlap(
      this.player,
      this.enemies,
      () => { this.triggerGameOver(); },
      undefined,
      this
    );
    // Candle hits player = Game Over
    this.physics.add.overlap(
      this.player,
      this.candles,
      (_p: PhysicsObj, candle: PhysicsObj) => {
        asSprite(candle).destroy();
        this.triggerGameOver();
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

    // Starting platform has minimal drift
    plat.setData('driftSpeed', Phaser.Math.Between(-10, 10));
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
      enemyChance = 0.10;
      collectableChance = 0.40;
    } else if (this.score < 1500) {
      // Stage 1: Medium
      spacingMin = 70;
      spacingMax = 110;
      platformDisplayWidth = 120;
      fragileChance = 0.12;
      enemyChance = 0.15;
      collectableChance = 0.28;
    } else {
      // Stage 2: Hard
      spacingMin = 90;
      spacingMax = 140;
      platformDisplayWidth = 100;
      fragileChance = 0.20;
      enemyChance = 0.22;
      collectableChance = 0.22;
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

    // Add horizontal drift — speed increases per stage
    const stage = this.score < 500 ? 0 : this.score < 1500 ? 1 : 2;
    const driftRange = CLOUD_DRIFT_SPEEDS[stage];
    const driftSpeed = Phaser.Math.Between(driftRange.min, driftRange.max);
    const driftDirection = Phaser.Math.RND.pick([-1, 1]);
    plat.setData('driftSpeed', driftSpeed * driftDirection);

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

      // Add drift to safe platform too (same stage speed)
      const stageSafe = this.score < 500 ? 0 : this.score < 1500 ? 1 : 2;
      const safeRange = CLOUD_DRIFT_SPEEDS[stageSafe];
      const safeDriftSpeed = Phaser.Math.Between(safeRange.min, safeRange.max);
      const safeDriftDirection = Phaser.Math.RND.pick([-1, 1]);
      safePlat.setData('driftSpeed', safeDriftSpeed * safeDriftDirection);
    }

    // Spawn enemy or collectable on normal platforms
    this.platformsSpawned++;
    if (platformKey === "cloud-normal" && Math.random() < enemyChance && this.platformsSpawned > 5) {
      this.spawnEnemy(x, y, dw);
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
    sphere.setDisplaySize(36, 36);
    sphere.setGravityY(-GRAVITY); // float in place
    sphere.setDepth(3);
  }

  private spawnEnemy(platX: number, platY: number, platWidth: number) {
    const bear = this.enemies.create(platX, platY - 30, "fud-bear") as Phaser.Physics.Arcade.Sprite;
    bear.setDisplaySize(52, 52);
    bear.setBodySize(34, 40);
    bear.setOffset(9, 6);
    bear.setGravityY(-GRAVITY);
    bear.setDepth(3);

    // Patrol bounds — stay on top of their platform
    const halfPlat = platWidth / 2;
    const leftBound  = platX - halfPlat + 10;
    const rightBound = platX + halfPlat - 10;
    bear.setData('leftBound', leftBound);
    bear.setData('rightBound', rightBound);
    bear.setData('platY', platY);

    // Patrol speed scales with score: +5 px/s every 200 pts
    const speedBoost = Math.floor(this.score / 200) * 5;
    const speed = ENEMY_PATROL_SPEED + speedBoost;
    bear.setVelocityX(speed);
    bear.setData('speed', speed);

    // Candle throw interval scales with score: -100ms every 200 pts
    const intervalReduction = Math.floor(this.score / 200) * 100;
    const interval = Math.max(CANDLE_INTERVAL_MIN, CANDLE_INTERVAL_BASE - intervalReduction);

    const timer = this.time.addEvent({
      delay: interval,
      loop: true,
      callback: () => {
        if (!bear.active || this.isGameOver) return;
        this.throwCandle(bear.x, bear.y + 20);
      },
    });
    bear.setData('candleTimer', timer);
  }

  private throwCandle(x: number, y: number) {
    const candle = this.candles.create(x, y, "love") as Phaser.Physics.Arcade.Sprite;
    candle.setDisplaySize(18, 28);
    candle.setTint(0xff2222);
    candle.setGravityY(-GRAVITY);
    candle.setVelocityY(CANDLE_SPEED);
    candle.setDepth(4);
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
    if (this.player.x < -10) this.player.x = GAME_WIDTH + 10;
    if (this.player.x > GAME_WIDTH + 10) this.player.x = -10;

    // Shoot cooldown
    if (this.shootCooldownMs > 0) {
      this.shootCooldownMs -= delta;
    }

    // Player texture based on velocity
    if (!this.isGameOver) {
      if (this.player.body!.velocity.y < -50) {
        if (this.player.texture.key !== "rocket") {
          this.player.setTexture("jump-up");
          this.player.setScale(85 / this.player.height);
        }
      } else if (this.player.body!.velocity.y > 50) {
        this.player.setTexture("fall-down");
        this.player.setScale(85 / this.player.height);
      } else {
        this.player.setTexture("idle");
        this.player.setScale(85 / this.player.height);
      }
    }

    // Track highest point and add score
    if (this.player.y < this.highestY) {
      const deltaY = this.highestY - this.player.y;
      this.highestY = this.player.y;
      this.addScore(Math.floor(deltaY * 0.1));
    }

    // Generate more platforms ahead
    const cam = this.cameras.main as Phaser.Cameras.Scene2D.Camera;
    const cameraTop = cam.scrollY;
    while (this.nextPlatformY > cameraTop - 200) {
      this.spawnPlatform();
    }

    const cameraBottom = cam.scrollY + cam.height;

    // Update cloud positions with drift and handle cleanup
    [this.cloudsNormal, this.cloudsBouncy, this.cloudsFragile].forEach((group) => {
      group.getChildren().forEach((p) => {
        const sprite = p as Phaser.Physics.Arcade.Sprite;
        if (sprite.y > cameraBottom + 200) {
          sprite.destroy();
        } else {
          // Apply drift movement to static bodies
          const driftSpeed = sprite.getData('driftSpeed') || 0;
          if (driftSpeed !== 0) {
            sprite.x += driftSpeed * (delta / 1000);
            
            // Reverse drift direction at screen edges
            if (sprite.x < 30 || sprite.x > GAME_WIDTH - 30) {
              sprite.setData('driftSpeed', -driftSpeed);
            }
            
            // Refresh static body after position change
            (sprite.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
          }
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

    // Update enemy patrol — bounce within platform bounds
    this.enemies.getChildren().forEach((e) => {
      const enemy = e as Phaser.Physics.Arcade.Sprite;
      if (enemy.y > cameraBottom + 200) {
        const timer = enemy.getData('candleTimer') as Phaser.Time.TimerEvent | undefined;
        if (timer) timer.remove(false);
        enemy.destroy();
        return;
      }
      const leftBound  = enemy.getData('leftBound') as number ?? 20;
      const rightBound = enemy.getData('rightBound') as number ?? GAME_WIDTH - 20;
      const speed      = enemy.getData('speed') as number ?? ENEMY_PATROL_SPEED;
      if (enemy.x <= leftBound) {
        enemy.setVelocityX(Math.abs(speed));
        enemy.setFlipX(false);
      } else if (enemy.x >= rightBound) {
        enemy.setVelocityX(-Math.abs(speed));
        enemy.setFlipX(true);
      }
    });

    // Remove candles that go off screen
    this.candles.getChildren().forEach((c: Phaser.GameObjects.GameObject) => {
      const candle = c as Phaser.Physics.Arcade.Sprite;
      if (candle.y > cameraBottom + 100 || candle.y < cameraTop - 100) {
        candle.destroy();
      }
    });

    // Game over if player falls below camera bottom
    if (this.player.y > cameraBottom + 60) {
      this.triggerGameOver();
    }
  }
}
