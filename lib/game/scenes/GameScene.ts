import * as Phaser from "phaser";

const GAME_WIDTH = 400;
const PLATFORM_HEIGHT = 12;
const PLATFORM_WIDTH = 80;
const PLAYER_BOUNCE = -800;
const BOOST_BOUNCE = -1400;
const PLATFORM_SPACING_MIN = 60;
const PLATFORM_SPACING_MAX = 120;
const GRAVITY = 1200;
const LOVE_SPEED = -700;
const ENEMY_PATROL_SPEED = 60;
const COLLECTABLE_SCORE = 50;
const ENEMY_SCORE = 100;

// Background stage thresholds (in score units)
const STAGE1_END = 500;
const STAGE2_END = 2000;

export default class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private fragilePlatforms!: Phaser.Physics.Arcade.StaticGroup;
  private loves!: Phaser.Physics.Arcade.Group;
  private collectables!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private boosts!: Phaser.Physics.Arcade.StaticGroup;
  private scoreText!: Phaser.GameObjects.Text;
  private score = 0;
  private highestY = 0;
  private nextPlatformY = 0;
  private bgImages: Phaser.GameObjects.Image[] = [];
  private meltingPlatforms = new WeakSet<Phaser.Physics.Arcade.Sprite>();
  private isGameOver = false;
  private lastPointerX = GAME_WIDTH / 2;
  private targetX = GAME_WIDTH / 2;
  private pointerDown = false;
  private pointerDownTime = 0;
  private lastTapTime = 0;
  private shootCooldownMs = 0;
  private bgStage = 0;
  private gameOverCallback?: (score: number) => void;

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
  }

  create() {
    const height = this.scale.height;
    const width = this.scale.width;

    // Background images (fixed to camera, one per stage)
    const bg0 = this.add.image(width / 2, height / 2, "level1")
      .setScrollFactor(0)
      .setDepth(-10)
      .setDisplaySize(width, height);
    const bg1 = this.add.image(width / 2, height / 2, "level2")
      .setScrollFactor(0)
      .setDepth(-10)
      .setDisplaySize(width, height)
      .setVisible(false);
    const bg2 = this.add.image(width / 2, height / 2, "level3")
      .setScrollFactor(0)
      .setDepth(-10)
      .setDisplaySize(width, height)
      .setVisible(false);
    this.bgImages = [bg0, bg1, bg2];

    // Physics world bounds (very tall)
    this.physics.world.setBounds(0, -99999, width, 100000 + height);

    // Groups
    this.platforms = this.physics.add.staticGroup();
    this.fragilePlatforms = this.physics.add.staticGroup();
    this.loves = this.physics.add.group();
    this.collectables = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.boosts = this.physics.add.staticGroup();

    // Generate initial platforms
    this.nextPlatformY = height - 80;
    this.spawnStartingPlatform();
    for (let i = 0; i < 20; i++) {
      this.spawnPlatform();
    }

    // Player
    this.player = this.physics.add.sprite(width / 2, height - 120, "jump-up");
    this.player.setDisplaySize(56, 56);
    this.player.setCollideWorldBounds(false);
    this.player.setGravityY(GRAVITY);
    this.player.setDepth(5);
    this.highestY = this.player.y;

    // Camera
    this.cameras.main.setBounds(0, -99999, width, 100000 + height);
    this.cameras.main.startFollow(this.player, true, 1, 0.1);
    this.cameras.main.setFollowOffset(0, height * 0.3);

    // Colliders
    type PhysicsObj = Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile;
    const asSprite = (o: PhysicsObj) => o as unknown as Phaser.Physics.Arcade.Sprite;
    this.physics.add.collider(
      this.player,
      this.platforms,
      (p) => { asSprite(p).setVelocityY(PLAYER_BOUNCE); asSprite(p).setTexture("jump-up"); },
      (p) => asSprite(p).body!.velocity.y >= 0,
      this
    );
    this.physics.add.collider(
      this.player,
      this.fragilePlatforms,
      (p, plat) => {
        asSprite(p).setVelocityY(PLAYER_BOUNCE);
        asSprite(p).setTexture("jump-up");
        const fragile = plat as unknown as Phaser.Physics.Arcade.Sprite;
        if (!this.meltingPlatforms.has(fragile)) {
          this.meltingPlatforms.add(fragile);
          this.time.delayedCall(1000, () => { fragile.destroy(); });
        }
      },
      (p) => asSprite(p).body!.velocity.y >= 0,
      this
    );
    this.physics.add.collider(
      this.player,
      this.boosts,
      (p, b) => {
        asSprite(p).setVelocityY(BOOST_BOUNCE);
        asSprite(p).setTexture("boost");
        (b as Phaser.GameObjects.GameObject).destroy();
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
    // Double tap within 300ms = shoot
    if (duration < 200 && dx < 20) {
      const timeSinceLastTap = this.time.now - this.lastTapTime;
      if (timeSinceLastTap < 300) {
        this.shootLove();
      }
      this.lastTapTime = this.time.now;
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
    love.setDisplaySize(28, 28);
    love.setVelocityY(LOVE_SPEED);
    love.setGravityY(-GRAVITY); // neutralise gravity so projectile flies straight
    love.setDepth(4);
    this.shootCooldownMs = 400;
  }

  // ─── Spawning helpers ─────────────────────────────────────────────────────

  private spawnStartingPlatform() {
    const width = this.scale.width;
    const height = this.scale.height;
    const plat = this.platforms.create(
      width / 2,
      height - 60,
      "base-cloud"
    ) as Phaser.Physics.Arcade.Sprite;
    plat.setDisplaySize(160, 45);
    this.setCloudHitbox(plat, 160);
    plat.refreshBody();
    plat.setDepth(2);
  }

  private spawnPlatform() {
    const width = this.scale.width;
    const rand = Phaser.Math.Between;
    const x = rand(PLATFORM_WIDTH / 2 + 10, width - PLATFORM_WIDTH / 2 - 10);
    const spacing = rand(PLATFORM_SPACING_MIN, PLATFORM_SPACING_MAX);
    this.nextPlatformY -= spacing;
    const y = this.nextPlatformY;

    // ~15% chance of fragile cloud platform
    const useFragile = this.score > 200 && Math.random() < 0.15;
    const textureKey = useFragile ? "fragile-cloud" : "base-cloud";
    const group = useFragile ? this.fragilePlatforms : this.platforms;

    const plat = group.create(x, y, textureKey) as Phaser.Physics.Arcade.Sprite;
    plat.setDisplaySize(120, 45);
    this.setCloudHitbox(plat, 120);
    plat.refreshBody();
    plat.setDepth(2);

    // Occasionally spawn a collectable or boost on the platform
    const roll = Math.random();
    if (roll < 0.12) {
      this.spawnBoostOnPlatform(x, y);
    } else if (roll < 0.28) {
      this.spawnCollectable(x, y - 20);
    } else if (roll < 0.38 && this.score > 100) {
      this.spawnEnemy(x, y);
    }
  }

  /** Configure the physics hitbox to the top flat edge of a cloud sprite. */
  private setCloudHitbox(plat: Phaser.Physics.Arcade.Sprite, displayWidth: number) {
    const bodyWidth = Math.round(displayWidth * 0.82);
    const offsetX = Math.round((displayWidth - bodyWidth) / 2);
    const body = plat.body as Phaser.Physics.Arcade.StaticBody;
    body.setSize(bodyWidth, PLATFORM_HEIGHT, false);
    body.setOffset(offsetX, 2);
  }

  private spawnCollectable(x: number, y: number) {
    const coin = this.collectables.create(
      x,
      y,
      "energy-coin"
    ) as Phaser.Physics.Arcade.Sprite;
    coin.setDisplaySize(26, 26);
    coin.setGravityY(-GRAVITY); // float in place
    coin.setDepth(3);
  }

  private spawnBoostOnPlatform(x: number, y: number) {
    const boost = this.boosts.create(
      x,
      y - 20,
      "boost"
    ) as Phaser.Physics.Arcade.Sprite;
    boost.setDisplaySize(32, 32);
    boost.refreshBody();
    boost.setDepth(3);
  }

  private spawnEnemy(x: number, y: number) {
    const enemy = this.enemies.create(x, y - 24, "bear-market") as Phaser.Physics.Arcade.Sprite;
    enemy.setDisplaySize(52, 52);
    enemy.setSize(36, 36);
    enemy.setGravityY(-GRAVITY);
    enemy.setVelocityX(ENEMY_PATROL_SPEED);
    enemy.setDepth(3);
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
      this.bgImages.forEach((bg, i) => bg.setVisible(i === newStage));
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
        this.player.setTexture("jump-up");
      } else if (this.player.body!.velocity.y > 50) {
        this.player.setTexture("fall-down");
      } else {
        this.player.setTexture("idle");
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

    // Remove platforms far below camera
    const cameraBottom = this.cameras.main.scrollY + this.scale.height;
    this.platforms.getChildren().forEach((p) => {
      const sprite = p as Phaser.Physics.Arcade.Sprite;
      if (sprite.y > cameraBottom + 200) sprite.destroy();
    });
    this.fragilePlatforms.getChildren().forEach((p) => {
      const sprite = p as Phaser.Physics.Arcade.Sprite;
      if (sprite.y > cameraBottom + 200) sprite.destroy();
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
      if (enemy.y > cameraBottom + 200) enemy.destroy();
    });

    // Game over if player falls below camera bottom
    if (this.player.y > cameraBottom + 60) {
      this.triggerGameOver();
    }
  }
}
