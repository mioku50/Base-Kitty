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
  private loves!: Phaser.Physics.Arcade.Group;
  private collectables!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private boosts!: Phaser.Physics.Arcade.StaticGroup;
  private scoreText!: Phaser.GameObjects.Text;
  private score = 0;
  private highestY = 0;
  private nextPlatformY = 0;
  private bgGraphics!: Phaser.GameObjects.Graphics;
  private stars: Phaser.GameObjects.Arc[] = [];
  private isGameOver = false;
  private lastPointerX = GAME_WIDTH / 2;
  private targetX = GAME_WIDTH / 2;
  private pointerDown = false;
  private pointerDownTime = 0;
  private shootCooldownMs = 0;
  private bgStage = 0;
  private gameOverCallback?: (score: number) => void;
  private canJump = true;
  private redCandleTimer = 0;
  private fudCloudTimer = 0;
  private redCandles!: Phaser.Physics.Arcade.Group;
  private fudClouds!: Phaser.Physics.Arcade.Group;
  private hookUsed = false;

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
  }

  create() {
    const height = this.scale.height;
    const width = this.scale.width;

    // Background graphics layer
    this.bgGraphics = this.add.graphics();
    this.bgGraphics.setScrollFactor(0);
    this.bgGraphics.setDepth(-10);

    this.drawBackground(0);

    // Physics world bounds (very tall)
    this.physics.world.setBounds(0, -99999, width, 100000 + height);

    // Groups
    this.platforms = this.physics.add.staticGroup();
    this.loves = this.physics.add.group();
    this.collectables = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.boosts = this.physics.add.staticGroup();
    this.redCandles = this.physics.add.group();
    this.fudClouds = this.physics.add.group();

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
      this.loves,
      this.fudClouds,
      (love, cloud) => {
        (love as Phaser.GameObjects.GameObject).destroy();
        (cloud as Phaser.GameObjects.GameObject).destroy();
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
    this.physics.add.overlap(
      this.player,
      this.fudClouds,
      () => { this.triggerGameOver(); },
      undefined,
      this
    );
    this.physics.add.overlap(
      this.player,
      this.redCandles,
      () => { this.triggerGameOver(); },
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

    this.redCandleTimer = 3000;
    this.fudCloudTimer = 5000;
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
    // Short tap = shoot
    if (duration < 200 && dx < 20) {
      this.shootLove();
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
    love.setDisplaySize(24, 24);
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
      undefined
    ) as Phaser.Physics.Arcade.Sprite;
    plat.setDisplaySize(160, PLATFORM_HEIGHT);
    plat.refreshBody();
    plat.setVisible(false);

    // Draw visible platform
    const gfx = this.add.graphics();
    gfx.fillStyle(0x9b59b6, 1);
    gfx.fillRoundedRect(
      width / 2 - 80,
      height - 66,
      160,
      PLATFORM_HEIGHT,
      6
    );
    gfx.setDepth(2);
  }

  private spawnPlatform() {
    const width = this.scale.width;
    const rand = Phaser.Math.Between;
    const x = rand(PLATFORM_WIDTH / 2 + 10, width - PLATFORM_WIDTH / 2 - 10);
    const spacing = rand(PLATFORM_SPACING_MIN, PLATFORM_SPACING_MAX);
    this.nextPlatformY -= spacing;
    const y = this.nextPlatformY;

    // Invisible physics body
    const plat = this.platforms.create(
      x,
      y,
      undefined
    ) as Phaser.Physics.Arcade.Sprite;
    plat.setDisplaySize(PLATFORM_WIDTH, PLATFORM_HEIGHT);
    plat.refreshBody();
    plat.setVisible(false);

    // Visible graphic
    const gfx = this.add.graphics();
    const color = this.getPlatformColor();
    gfx.fillStyle(color, 1);
    gfx.fillRoundedRect(
      x - PLATFORM_WIDTH / 2,
      y - PLATFORM_HEIGHT / 2,
      PLATFORM_WIDTH,
      PLATFORM_HEIGHT,
      6
    );
    gfx.setDepth(2);
    // Attach graphic so it's cleaned up conceptually (no built-in grouping needed)
    (plat as unknown as { gfx: Phaser.GameObjects.Graphics }).gfx = gfx;

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

  private getPlatformColor(): number {
    if (this.bgStage === 0) return 0x9b59b6;
    if (this.bgStage === 1) return 0x3498db;
    return 0x00d4ff;
  }

  private spawnCollectable(x: number, y: number) {
    const sphere = this.collectables.create(
      x,
      y,
      "base-sphere"
    ) as Phaser.Physics.Arcade.Sprite;
    sphere.setDisplaySize(22, 22);
    sphere.setGravityY(-GRAVITY); // float in place
    sphere.setDepth(3);
  }

  private spawnBoostOnPlatform(x: number, y: number) {
    const boost = this.boosts.create(
      x,
      y - 20,
      "boost"
    ) as Phaser.Physics.Arcade.Sprite;
    boost.setDisplaySize(26, 26);
    boost.refreshBody();
    boost.setDepth(3);
  }

  private spawnEnemy(x: number, y: number) {
    // FUD Bear (rectangle placeholder coloured red-brown)
    const bear = this.enemies.create(x, y - 20, undefined) as Phaser.Physics.Arcade.Sprite;
    bear.setDisplaySize(30, 30);
    bear.setGravityY(-GRAVITY);
    bear.setVelocityX(ENEMY_PATROL_SPEED);
    bear.setDepth(3);
    bear.setVisible(false);

    // Visual
    const gfx = this.add.graphics();
    gfx.fillStyle(0x8b4513, 1);
    gfx.fillRect(-15, -15, 30, 30);
    const container = this.add.container(x, y - 20, [gfx]);
    container.setDepth(3);
    (bear as unknown as { container: Phaser.GameObjects.Container }).container =
      container;
  }

  private spawnRedCandle() {
    const x = Phaser.Math.Between(20, this.scale.width - 20);
    const camY = this.cameras.main.scrollY;
    const candle = this.redCandles.create(
      x,
      camY - 30,
      undefined
    ) as Phaser.Physics.Arcade.Sprite;
    candle.setDisplaySize(16, 40);
    candle.setGravityY(200);
    candle.setVelocityY(120);
    candle.setDepth(4);
    candle.setVisible(false);

    const gfx = this.add.graphics();
    gfx.fillStyle(0xff0000, 1);
    gfx.fillRect(-8, -20, 16, 40);
    gfx.fillStyle(0xffa500, 1);
    gfx.fillRect(-4, -28, 8, 10);
    const c = this.add.container(x, camY - 30, [gfx]);
    c.setDepth(4);
    (candle as unknown as { container: Phaser.GameObjects.Container }).container = c;
  }

  private spawnFudCloud() {
    const camY = this.cameras.main.scrollY;
    const fromLeft = Math.random() < 0.5;
    const startX = fromLeft ? -60 : this.scale.width + 60;
    const y = camY + Phaser.Math.Between(20, 80);
    const cloud = this.fudClouds.create(
      startX,
      y,
      undefined
    ) as Phaser.Physics.Arcade.Sprite;
    cloud.setDisplaySize(70, 35);
    cloud.setGravityY(-GRAVITY);
    cloud.setVelocityX(fromLeft ? ENEMY_PATROL_SPEED * 1.2 : -ENEMY_PATROL_SPEED * 1.2);
    cloud.setDepth(3);
    cloud.setVisible(false);

    const gfx = this.add.graphics();
    gfx.fillStyle(0x555577, 0.9);
    gfx.fillEllipse(0, 0, 70, 35);
    const c = this.add.container(startX, y, [gfx]);
    c.setDepth(3);
    (cloud as unknown as { container: Phaser.GameObjects.Container }).container = c;
  }

  // ─── Background drawing ───────────────────────────────────────────────────

  private drawBackground(stage: number) {
    const w = this.scale.width;
    const h = this.scale.height;
    this.bgGraphics.clear();
    // Remove old stars
    this.stars.forEach((s) => s.destroy());
    this.stars = [];

    if (stage === 0) {
      // Dark Room / Web2 — dark purple/blue neon
      this.bgGraphics.fillGradientStyle(0x0a0020, 0x0a0020, 0x1a0040, 0x1a0040, 1);
      this.bgGraphics.fillRect(0, 0, w, h);
      // Neon grid lines
      this.bgGraphics.lineStyle(1, 0x9b59b6, 0.3);
      for (let i = 0; i < w; i += 40) {
        this.bgGraphics.lineBetween(i, 0, i, h);
      }
      for (let j = 0; j < h; j += 40) {
        this.bgGraphics.lineBetween(0, j, w, j);
      }
    } else if (stage === 1) {
      // Farcaster Atmosphere — indigo/purple gradient
      this.bgGraphics.fillGradientStyle(0x190041, 0x190041, 0x420d8e, 0x420d8e, 1);
      this.bgGraphics.fillRect(0, 0, w, h);
      // Stars
      for (let i = 0; i < 60; i++) {
        const sx = Phaser.Math.Between(0, w);
        const sy = Phaser.Math.Between(0, h);
        const star = this.add
          .circle(sx, sy, Phaser.Math.Between(1, 3), 0xffffff, 0.7)
          .setScrollFactor(0)
          .setDepth(-9);
        this.stars.push(star);
      }
    } else {
      // Onchain Heaven — bright sky blue/teal
      this.bgGraphics.fillGradientStyle(0x00aaff, 0x00aaff, 0x00ffcc, 0x00ffcc, 1);
      this.bgGraphics.fillRect(0, 0, w, h);
      // Bright stars/sparkles
      for (let i = 0; i < 40; i++) {
        const sx = Phaser.Math.Between(0, w);
        const sy = Phaser.Math.Between(0, h);
        const star = this.add
          .circle(sx, sy, Phaser.Math.Between(2, 5), 0xffffff, 0.9)
          .setScrollFactor(0)
          .setDepth(-9);
        this.stars.push(star);
      }
    }
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
      this.drawBackground(this.bgStage);
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

    // Remove platforms and their graphics far below camera
    const cameraBottom = this.cameras.main.scrollY + this.scale.height;
    this.platforms.getChildren().forEach((p) => {
      const sprite = p as Phaser.Physics.Arcade.Sprite;
      if (sprite.y > cameraBottom + 200) {
        const ext = sprite as unknown as { gfx?: Phaser.GameObjects.Graphics };
        ext.gfx?.destroy();
        sprite.destroy();
      }
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

    // Update enemy patrol and containers
    this.enemies.getChildren().forEach((e) => {
      const enemy = e as Phaser.Physics.Arcade.Sprite;
      const ext = enemy as unknown as { container?: Phaser.GameObjects.Container };
      if (ext.container) {
        ext.container.x = enemy.x;
        ext.container.y = enemy.y;
      }
      // Reverse patrol direction at screen edges
      if (enemy.x < 20 || enemy.x > this.scale.width - 20) {
        enemy.setVelocityX(-enemy.body!.velocity.x);
      }
      if (enemy.y > cameraBottom + 200) {
        ext.container?.destroy();
        enemy.destroy();
      }
    });

    // Update red candle containers
    this.redCandles.getChildren().forEach((c) => {
      const candle = c as Phaser.Physics.Arcade.Sprite;
      const ext = candle as unknown as { container?: Phaser.GameObjects.Container };
      if (ext.container) {
        ext.container.x = candle.x;
        ext.container.y = candle.y;
      }
      if (candle.y > cameraBottom + 200) {
        ext.container?.destroy();
        candle.destroy();
      }
    });

    // Update fud cloud containers
    this.fudClouds.getChildren().forEach((c) => {
      const cloud = c as Phaser.Physics.Arcade.Sprite;
      const ext = cloud as unknown as { container?: Phaser.GameObjects.Container };
      if (ext.container) {
        ext.container.x = cloud.x;
        ext.container.y = cloud.y;
      }
      if (
        cloud.x > this.scale.width + 100 ||
        cloud.x < -100 ||
        cloud.y > cameraBottom + 200
      ) {
        ext.container?.destroy();
        cloud.destroy();
      }
    });

    // Spawn red candles
    this.redCandleTimer -= delta;
    if (this.redCandleTimer <= 0 && this.score > 200) {
      this.spawnRedCandle();
      this.redCandleTimer = Phaser.Math.Between(4000, 8000);
    }

    // Spawn fud clouds
    this.fudCloudTimer -= delta;
    if (this.fudCloudTimer <= 0 && this.score > 300) {
      this.spawnFudCloud();
      this.fudCloudTimer = Phaser.Math.Between(5000, 10000);
    }

    // Game over if player falls below camera bottom
    if (this.player.y > cameraBottom + 60) {
      this.triggerGameOver();
    }
  }
}
