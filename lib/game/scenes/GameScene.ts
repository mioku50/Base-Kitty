import * as Phaser from "phaser";
import type { GameStats, GameOverCallback, SocialFriend } from "../types";
import { GAME_EVENTS } from "../types";

const PLATFORM_HEIGHT = 12;
const PLATFORM_WIDTH = 80;
const PLAYER_BOUNCE = -600;
const BOOST_BOUNCE = -1100;
const PLATFORM_SPACING_MIN = 60;
const PLATFORM_SPACING_MAX = 120;
const GRAVITY = 700;
const LOVE_SPEED = -700;
const HOLD_MOVE_SPEED = 260;
const SHOOT_BUTTON_Y_RATIO = 0.46;
const PRAYER_BUTTON_BOTTOM_SAFE_OFFSET = 112;
const SHOOT_BUTTON_BOTTOM_SAFE_OFFSET = 170;
const PRAYER_SCORE_MULTIPLIER = 2;
const PRAYER_JUMP_MULTIPLIER = 2;
const SOCIAL_CLOUD_SPAWN_CHANCE = 0.025;
const SOCIAL_CLOUD_MIN_PLATFORM_GAP = 20;
const ENEMY_PATROL_SPEED = 55;
const CANDLE_SPEED = 350;
const CANDLE_INTERVAL_BASE = 2500;  // ms
const CANDLE_INTERVAL_MIN = 1000;   // ms floor
const COLLECTABLE_SCORE = 50;
const ENEMY_SCORE = 100;
const AUTO_SHOOT_DETECT_RADIUS_Y = 280;
const AUTO_SHOOT_DETECT_OFFSET_X = 80;
const COMBO_WORDS = ["REKT!", "LIGMA!", "GM!", "WAGMI!"];
const ENEMY_SPAWN_MULTIPLIER = 1 / 6; // reduce enemy density ~6x from original (~2x from current)
const PRAYER_FILL_ENEMY = 20;    // prayer points per enemy kill (x10)
const PRAYER_FILL_COIN  = 5;     // prayer points per coin
const PRAYER_EFFECT_MS  = 10000; // super boost/freeze duration ms
const CLOUD_DRIFT_BASE_MULTIPLIER = 1.2;
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
  private pointerDown = false;
  private moveDir: -1 | 0 | 1 = 0;
  private shootCooldownMs = 0;
  private bgStage = 0;
  private gameOverCallback?: GameOverCallback;
  private enemiesKilled = 0;
  private coinsCollected = 0;
  private prayersUsed = 0;
  private hookUsed = false;
  private platformsSpawned = 0;
  private prayerMeter = 0;          // 0-100
  private prayerBoostMs = 0;        // countdown while super boost is active
  private prayerBarBg!: Phaser.GameObjects.Rectangle;
  private prayerBarFill!: Phaser.GameObjects.Rectangle;
  private prayerHaloIcon!: Phaser.GameObjects.Text;
  private prayerBtn!: Phaser.GameObjects.Container;
  private pauseBtn!: Phaser.GameObjects.Container;
  private shootBtn!: Phaser.GameObjects.Container;
  private isPaused = false;
  private cloudsSocial!: Phaser.Physics.Arcade.StaticGroup;
  private socialFriends: SocialFriend[] = [];
  private lastSocialCloudPlatform = -999;
  private avatarLoadQueued = new Set<string>();
  private boostPopupText?: Phaser.GameObjects.Text;
  private soundEnabled = true;
  private reviveInvulnerabilityMs = 0;
  private lastSafeX = 0;
  private lastSafeY = 0;
  private ambientStars: Phaser.GameObjects.Arc[] = [];
  private lastJumpBurstAt = 0;

  private getPrayerButtonY(height: number) {
    return Math.max(72, height - PRAYER_BUTTON_BOTTOM_SAFE_OFFSET);
  }

  private getShootButtonY(height: number) {
    const ratioY = height * SHOOT_BUTTON_Y_RATIO;
    const safeBottomY = height - SHOOT_BUTTON_BOTTOM_SAFE_OFFSET;
    return Math.max(92, Math.min(ratioY, safeBottomY));
  }

  private onScaleResize = (gameSize: { width: number; height: number }) => {
    const width = gameSize.width;
    const height = gameSize.height;

    this.bgImages.forEach((img) => {
      img.setPosition(width / 2, height / 2);
      img.setDisplaySize(width, height);
    });

    this.physics.world.setBounds(0, -99999, width, 100000 + height);
    this.cameras.main.setBounds(0, -99999, width, 100000 + height);
    this.cameras.main.setFollowOffset(0, height * 0.3);

    const barW = 120;
    const barH = 12;
    const barX = width - barW - 12;
    const barY = 18;

    this.scoreText.setPosition(12, 12);
    this.prayerHaloIcon.setPosition(barX - 22, barY - 2);
    this.prayerBarBg.setPosition(barX + barW / 2, barY + barH / 2);
    this.prayerBarFill.setPosition(barX, barY + barH / 2);
    this.prayerBtn.setPosition(width / 2, this.getPrayerButtonY(height));
    this.pauseBtn.setPosition(width - 24, 24);
    this.shootBtn.setPosition(width - 28, this.getShootButtonY(height));

    this.ambientStars.forEach((star) => {
      if (star.x > width + 20) star.x = Phaser.Math.Between(0, width);
      if (star.y > height + 20) star.y = Phaser.Math.Between(0, height);
    });
  };

  constructor(onGameOver?: GameOverCallback, socialFriends?: SocialFriend[]) {
    super({ key: "GameScene" });
    this.gameOverCallback = onGameOver;
    this.socialFriends = socialFriends || [];
  }

  init(data: { onGameOver?: GameOverCallback; socialFriends?: SocialFriend[] }) {
    if (data?.onGameOver) {
      this.gameOverCallback = data.onGameOver;
    }
    if (data?.socialFriends) {
      this.socialFriends = this.normalizeSocialFriends(data.socialFriends);
    }
    this.score = 0;
    this.isGameOver = false;
    this.highestY = 0;
    this.bgStage = 0;
    this.hookUsed = false;
    this.platformsSpawned = 0;
    this.prayerMeter = 0;
    this.prayerBoostMs = 0;
    this.enemiesKilled = 0;
    this.coinsCollected = 0;
    this.prayersUsed = 0;
    this.isPaused = false;
    this.moveDir = 0;
    this.pointerDown = false;
    this.lastSocialCloudPlatform = -999;
    this.reviveInvulnerabilityMs = 0;
    this.lastSafeX = 0;
    this.lastSafeY = 0;
    this.lastJumpBurstAt = 0;
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

    this.createAtmosphereFx();

    // Physics world bounds (very tall)
    this.physics.world.setBounds(0, -99999, width, 100000 + height);

    // Groups
    this.cloudsNormal = this.physics.add.staticGroup();
    this.cloudsBouncy = this.physics.add.staticGroup();
    this.cloudsFragile = this.physics.add.staticGroup();
    this.cloudsSocial  = this.physics.add.staticGroup();
    this.loves = this.physics.add.group({ allowGravity: false });
    this.collectables = this.physics.add.group({ allowGravity: false });
    this.enemies = this.physics.add.group({ allowGravity: false });
    this.candles = this.physics.add.group({ allowGravity: false });

    this.queueSocialAvatarLoads(this.socialFriends);

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
    this.lastSafeX = this.player.x;
    this.lastSafeY = this.player.y;

    // Add soft glow to player so it always stands out against dark backgrounds
    if (this.player.preFX) {
      this.player.preFX.addGlow(0xffccee, 6, 0, false, 0.1, 16);
    }

    // Camera
    this.cameras.main.setBounds(0, -99999, width, 100000 + height);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setFollowOffset(0, -height * 0.05);

    // Colliders
    type PhysicsObj = Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile;
    const asSprite = (o: PhysicsObj) => o as unknown as Phaser.Physics.Arcade.Sprite;

    // Normal clouds — standard bounce
    this.physics.add.collider(
      this.player,
      this.cloudsNormal,
      (p, plat) => {
        const player = asSprite(p);
        const cloud = asSprite(plat);
        this.markSafeCheckpoint(player, cloud);
        player.setVelocityY(PLAYER_BOUNCE);
        this.emitJumpBurst(player.x, cloud.y - 8);
      },
      (p, plat) => this.canLandOnCloud(asSprite(p), asSprite(plat)),
      this
    );

    // Bouncy clouds — super bounce + rocket texture briefly
    this.physics.add.collider(
      this.player,
      this.cloudsBouncy,
      (p, plat) => {
        const player = asSprite(p);
        const cloud = asSprite(plat);
        this.markSafeCheckpoint(player, cloud);
        player.setVelocityY(BOOST_BOUNCE);
        player.setTexture("rocket");
        player.setScale(85 / player.height);
        this.emitJumpBurst(player.x, cloud.y - 10);
      },
      (p, plat) => this.canLandOnCloud(asSprite(p), asSprite(plat)),
      this
    );

    // Fragile clouds — player falls through immediately, platform crumbles
    this.physics.add.collider(
      this.player,
      this.cloudsFragile,
      (_p, plat) => {
        this.markSafeCheckpoint(asSprite(_p), asSprite(plat));
        const sprite = plat as Phaser.Physics.Arcade.Sprite;
        const ext = sprite as unknown as { crumbling?: boolean };
        if (!ext.crumbling) {
          ext.crumbling = true;
          // Give a tiny bounce so the player has a moment to react
          asSprite(_p).setVelocityY(PLAYER_BOUNCE * 0.3);
          this.emitJumpBurst(asSprite(_p).x, sprite.y - 6);
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
      (p, plat) => this.canLandOnCloud(asSprite(p), asSprite(plat)),
      this
    );

    // Heart hits bear -> bear destroyed, +50 score + prayer fill
    this.physics.add.overlap(
      this.loves,
      this.enemies,
      (love, enemy) => {
        (love as Phaser.GameObjects.GameObject).destroy();
        const e = asSprite(enemy);
        const timer = e.getData('candleTimer') as Phaser.Time.TimerEvent | undefined;
        if (timer) timer.remove(false);
        this.spawnCollectable(e.x, e.y);
        (enemy as Phaser.GameObjects.GameObject).destroy();
        this.enemiesKilled++;
        this.addScore(50);
        this.addPrayer(PRAYER_FILL_ENEMY);
        this.emitEnemyBurst(e.x, e.y - 6);
        this.showComboPopup(e.x, e.y - 32);
      },
      undefined,
      this
    );
    this.physics.add.overlap(
      this.player,
      this.collectables,
      (_p, sphere) => {
        const collect = asSprite(sphere);
        this.emitCoinBurst(collect.x, collect.y);
        collect.destroy();
        this.coinsCollected++;
        this.addScore(COLLECTABLE_SCORE);
        this.addPrayer(PRAYER_FILL_COIN);
      },
      undefined,
      this
    );
    // Any contact with bear = Game Over
    this.physics.add.overlap(
      this.player,
      this.enemies,
      () => {
        if (this.reviveInvulnerabilityMs > 0) return;
        this.triggerGameOver();
      },
      undefined,
      this
    );
    // Candle hits player = Game Over
    this.physics.add.overlap(
      this.player,
      this.candles,
      (_p: PhysicsObj, candle: PhysicsObj) => {
        if (this.reviveInvulnerabilityMs > 0) return;
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

    // ── Prayer Meter HUD ──────────────────────────────────────────────
    const barW = 120;
    const barH = 12;
    const barX = width - barW - 12;
    const barY = 18;

    // Halo icon
    this.prayerHaloIcon = this.add
      .text(barX - 22, barY - 2, "😇", { fontSize: "18px" })
      .setScrollFactor(0)
      .setDepth(21);

    // Background bar
    this.prayerBarBg = this.add
      .rectangle(barX + barW / 2, barY + barH / 2, barW, barH, 0x333333, 0.7)
      .setScrollFactor(0)
      .setDepth(21);

    // Fill bar (starts at 0 width, aligned left)
    this.prayerBarFill = this.add
      .rectangle(barX, barY + barH / 2, 0, barH, 0xffd700)
      .setScrollFactor(0)
      .setOrigin(0, 0.5)
      .setDepth(22);

    // Activate button — hidden until meter is full
    const btnBg = this.add
      .rectangle(0, 0, 120, 38, 0xffd700, 0.95)
      .setStrokeStyle(2, 0xffffff);
    const btnText = this.add
      .text(0, 0, "😇 Prayer!", { fontSize: "15px", color: "#222222" })
      .setOrigin(0.5);
    this.prayerBtn = this.add
      .container(width / 2, this.getPrayerButtonY(height), [btnBg, btnText])
      .setScrollFactor(0)
      .setDepth(25)
      .setVisible(false)
      .setSize(120, 38)
      .setInteractive()
      .on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.activatePrayer();
      });

    // Shoot button HUD (right side, slightly above center)
    const shootBg = this.add
      .circle(0, 0, 22, 0xff4da6, 0.92)
      .setStrokeStyle(2, 0xffffff, 0.8);
    const shootIcon = this.add
      .text(0, 0, "💖", { fontSize: "18px" })
      .setOrigin(0.5);
    this.shootBtn = this.add
      .container(width - 28, this.getShootButtonY(height), [shootBg, shootIcon])
      .setScrollFactor(0)
      .setDepth(30)
      .setSize(44, 44)
      .setInteractive()
      .on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.shootLove();
      });

    // Social cloud collider — super-boost + popup
    this.physics.add.collider(
      this.player,
      this.cloudsSocial,
      (p, plat) => {
        const sprite = plat as Phaser.Physics.Arcade.Sprite;
        const username = sprite.getData('username') as string | undefined;
        const player = p as Phaser.Physics.Arcade.Sprite;
        this.markSafeCheckpoint(player, sprite);
        player.setVelocityY(BOOST_BOUNCE * 1.15);
        this.showBoostPopup(username || 'friend');
        this.emitJumpBurst(player.x, sprite.y - 10);
      },
      (p, plat) => this.canLandOnCloud(asSprite(p), asSprite(plat)),
      this
    );

    // ── Pause button HUD ────────────────────────────────────────────
    const pauseBg = this.add
      .rectangle(0, 0, 36, 36, 0x000000, 0.45)
      .setStrokeStyle(1.5, 0xffffff, 0.4);
    pauseBg.setInteractive(new Phaser.Geom.Rectangle(-18, -18, 36, 36), Phaser.Geom.Rectangle.Contains);
    const pauseIcon = this.add
      .text(0, 0, '⏸', { fontSize: '18px' })
      .setOrigin(0.5);
    this.pauseBtn = this.add
      .container(width - 24, 24, [pauseBg, pauseIcon])
      .setScrollFactor(0)
      .setDepth(30)
      .setSize(36, 36)
      .setInteractive()
      .on(
        "pointerdown",
        (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation();
          this.togglePause();
        }
      );

    // Input
    this.input.on("pointerdown", this.onPointerDown, this);
    this.input.on("pointermove", this.onPointerMove, this);
    this.input.on("pointerup", this.onPointerUp, this);

    this.scale.on("resize", this.onScaleResize);
    this.events.on(Phaser.Scenes.Events.PRE_UPDATE, this.onPreUpdate, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off("resize", this.onScaleResize);
      this.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.onPreUpdate, this);
      this.ambientStars.forEach((star) => star.destroy());
      this.ambientStars = [];
    });
  }

  // Public API: allows React layer to refresh social friends while a run is already active.
  setSocialFriends(friends: SocialFriend[]) {
    this.socialFriends = this.normalizeSocialFriends(friends);
    this.queueSocialAvatarLoads(this.socialFriends);
  }

  private normalizeSocialFriends(friends: SocialFriend[]): SocialFriend[] {
    const deduped = new Map<number, SocialFriend>();
    friends.forEach((friend) => {
      if (!friend || typeof friend.fid !== "number") return;
      if (!friend.pfpUrl) return;
      const existing = deduped.get(friend.fid);
      if (existing) return;
      deduped.set(friend.fid, {
        fid: friend.fid,
        username: friend.username || `fid:${friend.fid}`,
        pfpUrl: friend.pfpUrl,
      });
    });
    return [...deduped.values()];
  }

  private queueSocialAvatarLoads(friends: SocialFriend[]) {
    let queuedAtLeastOne = false;

    friends.forEach((friend) => {
      const key = `avatar-${friend.fid}`;
      if (this.textures.exists(key)) return;
      if (this.avatarLoadQueued.has(key)) return;
      this.avatarLoadQueued.add(key);
      this.load.image(key, friend.pfpUrl);
      queuedAtLeastOne = true;
    });

    if (queuedAtLeastOne && !this.load.isLoading()) {
      this.load.start();
    }
  }

  private canLandOnCloud(playerObj: Phaser.Physics.Arcade.Sprite, cloudObj: Phaser.Physics.Arcade.Sprite) {
    const playerBody = playerObj.body as Phaser.Physics.Arcade.Body | undefined;
    const cloudBody = cloudObj.body as
      | Phaser.Physics.Arcade.StaticBody
      | Phaser.Physics.Arcade.Body
      | undefined;

    if (!playerBody || !cloudBody) return false;
    if (playerBody.velocity.y < 0) return false;

    // Only land if the player is actually near the cloud top this frame.
    const playerBottom = playerBody.bottom;
    const cloudTop = cloudBody.top;
    if (playerBottom < cloudTop - 8 || playerBottom > cloudTop + 16) return false;

    // Tighten horizontal tolerance to avoid "landing on empty space".
    const horizontalDistance = Math.abs(playerBody.center.x - cloudBody.center.x);
    const maxDistance = cloudBody.width * 0.5 + playerBody.width * 0.15;
    return horizontalDistance <= maxDistance;
  }

  private driftCloudGroup(
    group: Phaser.Physics.Arcade.StaticGroup,
    delta: number,
    viewWidth: number,
    cloudsFrozen: boolean,
    hasLabel = false
  ) {
    if (cloudsFrozen) return;

    group.getChildren().forEach((obj) => {
      const sprite = obj as Phaser.Physics.Arcade.Sprite;
      const driftSpeed = sprite.getData("driftSpeed") || 0;
      if (driftSpeed === 0) return;

      sprite.x += driftSpeed * (delta / 1000);
      if (sprite.x < 30 || sprite.x > viewWidth - 30) {
        sprite.setData("driftSpeed", -driftSpeed);
      }

      if (hasLabel) {
        const label = sprite.getData("label") as Phaser.GameObjects.Text | undefined;
        if (label) label.x = sprite.x;
      }

      const body = sprite.body as Phaser.Physics.Arcade.StaticBody | undefined;
      body?.updateFromGameObject();
    });
  }

  private onPreUpdate(_time: number, delta: number) {
    if (this.isGameOver || this.isPaused) return;

    const viewWidth = this.scale.width;
    const cloudsFrozen = this.prayerBoostMs > 0;
    this.driftCloudGroup(this.cloudsNormal, delta, viewWidth, cloudsFrozen);
    this.driftCloudGroup(this.cloudsBouncy, delta, viewWidth, cloudsFrozen);
    this.driftCloudGroup(this.cloudsFragile, delta, viewWidth, cloudsFrozen);
    this.driftCloudGroup(this.cloudsSocial, delta, viewWidth, cloudsFrozen, true);
    this.updateAtmosphere(delta);
  }

  // ─── Ambient FX ─────────────────────────────────────────────────────────────

  private createAtmosphereFx() {
    const width = this.scale.width;
    const height = this.scale.height;

    for (let i = 0; i < 16; i++) {
      const star = this.add
        .circle(
          Phaser.Math.Between(0, width),
          Phaser.Math.Between(0, height),
          Phaser.Math.Between(1, 3),
          Phaser.Math.RND.pick([0xbfe8ff, 0xcfa8ff, 0xffffff]),
          Phaser.Math.FloatBetween(0.35, 0.9)
        )
        .setDepth(-7)
        .setScrollFactor(0);

      star.setData("driftSpeed", Phaser.Math.FloatBetween(6, 24));
      this.ambientStars.push(star);

      this.tweens.add({
        targets: star,
        alpha: { from: Phaser.Math.FloatBetween(0.25, 0.45), to: Phaser.Math.FloatBetween(0.7, 1) },
        scale: { from: 0.7, to: 1.2 },
        duration: Phaser.Math.Between(1300, 2800),
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(50, 900),
      });
    }

    const scheduleNextComet = () => {
      const delay = Phaser.Math.Between(5500, 9500);
      this.time.delayedCall(delay, () => {
        if (!this.scene.isActive()) return;
        if (!this.isPaused && !this.isGameOver) {
          this.spawnCometFx();
        }
        scheduleNextComet();
      });
    };

    scheduleNextComet();
  }

  private updateAtmosphere(delta: number) {
    const width = this.scale.width;
    const height = this.scale.height;

    this.ambientStars.forEach((star) => {
      const driftSpeed = Number(star.getData("driftSpeed") ?? 0);
      star.y += driftSpeed * (delta / 1000);
      if (star.y > height + 12) {
        star.y = -12;
        star.x = Phaser.Math.Between(0, width);
      }
    });
  }

  private spawnCometFx() {
    const width = this.scale.width;
    const height = this.scale.height;
    const fromLeft = Math.random() < 0.5;
    const startX = fromLeft ? -70 : width + 70;
    const endX = fromLeft ? width + 80 : -80;
    const startY = Phaser.Math.Between(Math.floor(height * 0.08), Math.floor(height * 0.45));
    const endY = startY + Phaser.Math.Between(60, 120);
    const angle = fromLeft ? 0.35 : -0.35;

    const comet = this.add
      .ellipse(startX, startY, 14, 5, 0x9be7ff, 0.95)
      .setDepth(-6)
      .setScrollFactor(0)
      .setRotation(angle);

    const tail = this.add
      .rectangle(startX + (fromLeft ? -20 : 20), startY + 2, 38, 2, 0x9be7ff, 0.35)
      .setDepth(-7)
      .setScrollFactor(0)
      .setRotation(angle);

    this.tweens.add({
      targets: [comet, tail],
      x: endX,
      y: endY,
      alpha: { from: 1, to: 0 },
      duration: Phaser.Math.Between(1200, 1700),
      ease: "Sine.easeIn",
      onComplete: () => {
        comet.destroy();
        tail.destroy();
      },
    });
  }

  private emitBurstParticles(
    x: number,
    y: number,
    palette: number[],
    count: number,
    spreadX: number,
    spreadY: number,
    lifetimeMs: number
  ) {
    for (let i = 0; i < count; i++) {
      const particle = this.add
        .circle(x, y, Phaser.Math.Between(2, 4), Phaser.Math.RND.pick(palette), 0.95)
        .setDepth(7)
        .setScrollFactor(1);
      const vx = Phaser.Math.Between(-spreadX, spreadX);
      const vy = Phaser.Math.Between(-spreadY, spreadY);

      this.tweens.add({
        targets: particle,
        x: x + vx,
        y: y + vy - Phaser.Math.Between(8, 26),
        scale: { from: 1, to: 0.1 },
        alpha: { from: 0.95, to: 0 },
        duration: lifetimeMs + Phaser.Math.Between(-80, 120),
        ease: "Cubic.easeOut",
        onComplete: () => particle.destroy(),
      });
    }
  }

  private emitJumpBurst(x: number, y: number) {
    const now = this.time.now;
    if (now - this.lastJumpBurstAt < 110) return;
    this.lastJumpBurstAt = now;
    this.emitBurstParticles(x, y, [0xaee7ff, 0xdab8ff, 0xffffff], 10, 24, 20, 420);
  }

  private emitCoinBurst(x: number, y: number) {
    this.emitBurstParticles(x, y, [0xfff18f, 0x88f0ff, 0xffd27a], 8, 18, 16, 360);
  }

  private emitEnemyBurst(x: number, y: number) {
    this.emitBurstParticles(x, y, [0xff7ebd, 0xffd37a, 0xb0d2ff], 12, 28, 24, 460);
  }

  private showComboPopup(x: number, y: number) {
    const comboText = Phaser.Math.RND.pick(COMBO_WORDS);
    const popup = this.add
      .text(x, y, comboText, {
        fontSize: "20px",
        fontStyle: "900",
        color: "#ffe082",
        stroke: "#2a0b46",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(34)
      .setAngle(Phaser.Math.Between(-8, 8));

    this.tweens.add({
      targets: popup,
      alpha: { from: 1, to: 0 },
      y: y - 34,
      scale: { from: 0.92, to: 1.08 },
      duration: 850,
      ease: "Cubic.easeOut",
      onComplete: () => popup.destroy(),
    });
  }

  // ─── Input handlers ──────────────────────────────────────────────────────────

  private getPointerMoveDir(x: number): -1 | 0 | 1 {
    const width = this.scale.width;
    if (x < width * 0.45) return -1;
    if (x > width * 0.55) return 1;
    return 0;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    this.pointerDown = true;
    this.moveDir = this.getPointerMoveDir(pointer.x);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (this.pointerDown) {
      this.moveDir = this.getPointerMoveDir(pointer.x);
    }
  }

  private onPointerUp() {
    this.pointerDown = false;
    this.moveDir = 0;
  }

  private markSafeCheckpoint(
    playerObj: Phaser.Physics.Arcade.Sprite,
    cloudObj: Phaser.Physics.Arcade.Sprite
  ) {
    const cloudBody = cloudObj.body as Phaser.Physics.Arcade.StaticBody | Phaser.Physics.Arcade.Body | undefined;
    if (cloudBody) {
      this.lastSafeX = cloudBody.center.x;
      this.lastSafeY = cloudBody.top - playerObj.displayHeight * 0.45;
      return;
    }
    this.lastSafeX = playerObj.x;
    this.lastSafeY = playerObj.y;
  }

  private spawnReviveCloud(x: number, y: number, width = 140, driftSpeed = 0) {
    const safeX = Phaser.Math.Clamp(x, PLATFORM_WIDTH / 2 + 10, this.scale.width - PLATFORM_WIDTH / 2 - 10);
    const plat = this.cloudsNormal.create(safeX, y, "cloud-normal") as Phaser.Physics.Arcade.Sprite;
    plat.setDisplaySize(width, 45);
    plat.setSize(width * 0.75, 10);
    plat.setOffset(width * 0.125, 4);
    plat.refreshBody();
    plat.setDepth(2);
    // Rescue cloud can be fixed or gently drifting.
    plat.setData("driftSpeed", driftSpeed);
    return plat;
  }

  // ─── Shooting ─────────────────────────────────────────────────────────────

  private shootLove() {
    if (this.isGameOver) return;
    if (this.isPaused) return;
    if (this.shootCooldownMs > 0) return;
    const love = this.loves.create(
      this.player.x,
      this.player.y - 30,
      "love"
    ) as Phaser.Physics.Arcade.Sprite;
    love.setDisplaySize(28, 28);
    love.setVelocityY(LOVE_SPEED);
    love.setDepth(4);
    this.shootCooldownMs = 400;
  }

  private hasAutoShootTarget(): boolean {
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body | undefined;
    if (!playerBody) return false;
    if (playerBody.velocity.y >= -20) return false;

    const px = this.player.x;
    const py = this.player.y;
    let bestDeltaY = Number.POSITIVE_INFINITY;

    this.enemies.getChildren().forEach((e) => {
      const enemy = e as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) return;

      const dx = Math.abs(enemy.x - px);
      if (dx > AUTO_SHOOT_DETECT_OFFSET_X) return;

      const dy = py - enemy.y;
      if (dy <= 0 || dy > AUTO_SHOOT_DETECT_RADIUS_Y) return;

      if (dy < bestDeltaY) {
        bestDeltaY = dy;
      }
    });

    return Number.isFinite(bestDeltaY);
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

  private getCloudDriftMultiplier(score: number): number {
    let multiplier = CLOUD_DRIFT_BASE_MULTIPLIER;

    if (score >= 500) multiplier *= 1.3;
    if (score >= 1000) multiplier *= 1.3;
    if (score >= 1500) multiplier *= 1.3 * 0.9; // soften drift by 10% at 1500+
    if (score >= 2000) multiplier *= 0.9;       // additional 10% soften at 2000+
    // Keep 2500+ at the same drift level as 2000+ (no further speed ramps).

    return multiplier;
  }

  private getEnemySpawnMultiplier(score: number): number {
    return 1 + Math.floor(score / 500) * 0.2;
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
      enemyChance = 0.10 * ENEMY_SPAWN_MULTIPLIER;
      // Stage 0: base collectible rate
      collectableChance = 0.10;
    } else if (this.score < 1500) {
      // Stage 1: Medium
      spacingMin = 70;
      spacingMax = 110;
      platformDisplayWidth = 120;
      fragileChance = 0.12;
      enemyChance = 0.15 * ENEMY_SPAWN_MULTIPLIER;
      // Stage 1: x1.5 from base, then x2 from base after 1000+
      collectableChance = this.score < 1000 ? 0.15 : 0.20;
    } else {
      // Stage 2: Hard (slightly denser clouds after 1500+)
      spacingMin = 84;
      spacingMax = 132;
      platformDisplayWidth = 100;
      fragileChance = 0.20;
      enemyChance = 0.22 * ENEMY_SPAWN_MULTIPLIER;
      // Stage 2+: noticeably more collectibles after 1500+, with extra density after 2000+.
      collectableChance = this.score < 2000 ? 0.28 : 0.34;
    }

    // Enemy spawn density ramps up by +20% every 500 score.
    enemyChance = Math.min(
      enemyChance * this.getEnemySpawnMultiplier(this.score),
      0.9
    );

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

    // Add horizontal drift — with progressive multipliers by score milestones.
    const stage = this.score < 500 ? 0 : this.score < 1500 ? 1 : 2;
    const driftRange = CLOUD_DRIFT_SPEEDS[stage];
    const driftMultiplier = this.getCloudDriftMultiplier(this.score);
    const driftMin = Math.max(6, Math.round(driftRange.min * driftMultiplier));
    const driftMax = Math.max(driftMin + 1, Math.round(driftRange.max * driftMultiplier));
    const driftSpeed = Phaser.Math.Between(driftMin, driftMax);
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
      const safeMultiplier = this.getCloudDriftMultiplier(this.score);
      const safeMin = Math.max(6, Math.round(safeRange.min * safeMultiplier));
      const safeMax = Math.max(safeMin + 1, Math.round(safeRange.max * safeMultiplier));
      const safeDriftSpeed = Phaser.Math.Between(safeMin, safeMax);
      const safeDriftDirection = Phaser.Math.RND.pick([-1, 1]);
      safePlat.setData('driftSpeed', safeDriftSpeed * safeDriftDirection);
    }

    // Spawn enemy or collectable on normal platforms
    this.platformsSpawned++;

    // Rare "social cloud" event with a minimum platform gap.
    const canSpawnSocialCloud =
      this.socialFriends.length > 0 &&
      this.platformsSpawned > 12 &&
      this.platformsSpawned - this.lastSocialCloudPlatform >= SOCIAL_CLOUD_MIN_PLATFORM_GAP &&
      Math.random() < SOCIAL_CLOUD_SPAWN_CHANCE;

    if (canSpawnSocialCloud) {
      this.spawnSocialCloud(x, y - spacing / 2);
      this.lastSocialCloudPlatform = this.platformsSpawned;
    } else if (platformKey === "cloud-normal" && Math.random() < enemyChance && this.platformsSpawned > 5) {
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
    sphere.setDepth(3);
  }

  private spawnEnemy(platX: number, platY: number, platWidth: number) {
    const bear = this.enemies.create(platX, platY - 30, "fud-bear") as Phaser.Physics.Arcade.Sprite;
    bear.setDisplaySize(52, 52);
    bear.setBodySize(34, 40);
    bear.setOffset(9, 6);
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
    candle.setVelocityY(CANDLE_SPEED);
    candle.setDepth(4);
  }

  // ─── Score helpers ────────────────────────────────────────────────────────

  private addScore(pts: number, applyPrayerMultiplier = true) {
    const scoreMultiplier =
      applyPrayerMultiplier && this.prayerBoostMs > 0 ? PRAYER_SCORE_MULTIPLIER : 1;
    this.score += Math.max(0, Math.floor(pts * scoreMultiplier));
    this.scoreText.setText(`Score: ${this.score}`);
    this.checkBackgroundStage();
  }

  private addPrayer(pts: number) {
    if (this.prayerMeter >= 100) return;
    this.prayerMeter = Math.min(100, this.prayerMeter + pts);
    this.updatePrayerUI();
  }

  private updatePrayerUI() {
    const barW = 120;
    this.prayerBarFill.width = barW * (this.prayerMeter / 100);
    if (this.prayerMeter >= 100) {
      this.prayerBarFill.setFillStyle(0xffd700);
      // Pulse the bar to hint the player
      this.tweens.add({
        targets: this.prayerBarFill,
        alpha: { from: 1, to: 0.4 },
        duration: 400,
        yoyo: true,
        repeat: -1,
      });
      this.prayerBtn.setVisible(true);
    }
  }

  private activatePrayer() {
    if (this.prayerMeter < 100) return;
    this.prayerMeter = 0;
    this.prayersUsed++;
    this.prayerBoostMs = PRAYER_EFFECT_MS;
    this.prayerBtn.setVisible(false);
    this.tweens.killTweensOf(this.prayerBarFill);
    this.prayerBarFill.setAlpha(1).setFillStyle(0x88ddff);
    this.player.setVelocityY(BOOST_BOUNCE * PRAYER_JUMP_MULTIPLIER);
    this.player.setTexture("rocket");
    this.player.setScale(85 / this.player.height);
    this.showPrayerBoostPopup();
    this.emitBurstParticles(this.player.x, this.player.y + 20, [0xffef99, 0xbce8ff, 0xf8c9ff], 16, 34, 26, 520);
    this.updatePrayerUI();
  }

  private checkBackgroundStage() {
    const newStage =
      this.score >= STAGE2_END ? 2 : this.score >= STAGE1_END ? 1 : 0;
    if (newStage !== this.bgStage) {
      this.bgStage = newStage;
      this.bgImages.forEach((img, i) => img.setVisible(i === newStage));
    }
  }

  // ─── Pause ──────────────────────────────────────────────────────────────

  togglePause() {
    if (this.isGameOver) return;
    if (this.isPaused) {
      this.resumeGame();
    } else {
      this.pauseGame();
    }
  }

  pauseGame() {
    if (this.isGameOver || this.isPaused) return;
    this.isPaused = true;
    this.physics.pause();
    this.time.paused = true;
    // Update icon to play symbol
    const icon = (this.pauseBtn.list[1] as Phaser.GameObjects.Text);
    icon.setText('▶');
    // Emit to React layer
    this.game.events.emit(GAME_EVENTS.PAUSE);
  }

  resumeGame() {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.physics.resume();
    this.time.paused = false;
    const icon = (this.pauseBtn.list[1] as Phaser.GameObjects.Text);
    icon.setText('⏸');
    this.game.events.emit(GAME_EVENTS.RESUME);
  }

  // ─── Social Cloud ────────────────────────────────────────────────────────

  private spawnSocialCloud(x: number, y: number) {
    if (this.socialFriends.length === 0) return;
    const friend = Phaser.Math.RND.pick(this.socialFriends) as SocialFriend;
    const avatarKey = `avatar-${friend.fid}`;
    const texKey = this.textures.exists(avatarKey) ? avatarKey : 'cloud-bouncy';

    const plat = this.cloudsSocial.create(x, y, texKey) as Phaser.Physics.Arcade.Sprite;
    const dw = 110;
    const dh = 50;
    plat.setDisplaySize(dw, dh);
    plat.setCircle(Math.min(plat.width, plat.height) / 2);
    // Use avatar as circle if loaded, otherwise fall back to rect hitbox
    plat.setSize(dw * 0.75, 10);
    plat.setOffset(dw * 0.125, 4);
    plat.refreshBody();
    plat.setDepth(2);
    plat.setData('username', friend.username);
    plat.setData('driftSpeed', Phaser.Math.Between(-25, 25));

    // Draw avatar label below the cloud
    const label = this.add
      .text(x, y + 30, `@${friend.username}`, {
        fontSize: '10px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0)
      .setDepth(3)
      .setScrollFactor(1);
    plat.setData('label', label);
  }

  private showBoostPopup(username: string) {
    if (this.boostPopupText) {
      this.boostPopupText.destroy();
    }
    const camY = this.cameras.main.scrollY;
    this.boostPopupText = this.add
      .text(this.scale.width / 2, camY + 80, `😺 Boosted by @${username}!`, {
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#ffe066',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(35)
      .setScrollFactor(0);
    this.tweens.add({
      targets: this.boostPopupText,
      alpha: { from: 1, to: 0 },
      y: '-=30',
      duration: 2200,
      ease: 'Power2.easeOut',
      onComplete: () => { this.boostPopupText?.destroy(); this.boostPopupText = undefined; },
    });
    // Emit to React layer too
    this.game.events.emit(GAME_EVENTS.BOOST_POPUP, { username });
  }

  private showPrayerBoostPopup() {
    const camY = this.cameras.main.scrollY;
    const popup = this.add
      .text(this.scale.width / 2, camY + 120, "😇🪽 ANGEL BOOST x2!", {
        fontSize: "18px",
        fontStyle: "bold",
        color: "#ffe066",
        stroke: "#000000",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(36)
      .setScrollFactor(0);

    this.tweens.add({
      targets: popup,
      alpha: { from: 1, to: 0 },
      y: "-=40",
      duration: 1600,
      ease: "Power2.easeOut",
      onComplete: () => popup.destroy(),
    });
  }

  reviveFromShare(): boolean {
    if (!this.isGameOver) return false;

    const camera = this.cameras.main;
    const cameraTop = camera.scrollY;
    const cameraBottom = camera.scrollY + camera.height;
    const reviveX = Phaser.Math.Clamp(
      this.lastSafeX || this.player.x || this.scale.width / 2,
      24,
      this.scale.width - 24
    );
    const fallbackY = cameraTop + camera.height * 0.58;
    const candidateY = Number.isFinite(this.lastSafeY) ? this.lastSafeY : fallbackY;
    // Keep revive position in visible safe zone so rescue clouds are reachable immediately.
    const reviveY = Phaser.Math.Clamp(candidateY, cameraTop + 120, cameraBottom - 160);

    this.isGameOver = false;
    this.physics.resume();
    this.pointerDown = false;
    this.moveDir = 0;

    const stage = this.score < 500 ? 0 : this.score < 1500 ? 1 : 2;
    const driftRange = CLOUD_DRIFT_SPEEDS[stage];
    const driftMultiplier = this.getCloudDriftMultiplier(this.score);
    const minDrift = Math.max(8, Math.round(driftRange.min * driftMultiplier * 0.6));
    const maxDrift = Math.max(minDrift + 1, Math.round(driftRange.max * driftMultiplier * 0.6));
    const backupDrift = Phaser.Math.Between(minDrift, maxDrift) * Phaser.Math.RND.pick([-1, 1]);

    const primaryCloud = this.spawnReviveCloud(
      reviveX,
      reviveY + 72,
      this.score >= 1500 ? 120 : 140
    );
    // Add one nearby backup cloud to avoid revive into empty space.
    const backupOffset = Phaser.Math.RND.pick([-96, 96]);
    this.spawnReviveCloud(
      Phaser.Math.Clamp(
        primaryCloud.x + backupOffset,
        PLATFORM_WIDTH / 2 + 10,
        this.scale.width - PLATFORM_WIDTH / 2 - 10
      ),
      reviveY + 58,
      this.score >= 1500 ? 110 : 130,
      backupDrift
    );

    // Rebuild a normal cloud lane around revive altitude so gameplay immediately continues.
    this.nextPlatformY = Math.max(this.nextPlatformY, reviveY + 140);
    const spawnUntilY = cameraTop - 220;
    let spawnGuard = 0;
    while (this.nextPlatformY > spawnUntilY && spawnGuard < 28) {
      this.spawnPlatform();
      spawnGuard++;
    }

    // Start slightly above the rescue cloud and let gravity drop into a guaranteed bounce.
    const playerStartY = primaryCloud.y - 58;
    this.player.setPosition(primaryCloud.x, playerStartY);
    this.player.setVelocity(0, 120);
    this.player.setTexture("fall-down");
    this.player.setScale(85 / this.player.height);
    this.player.setAlpha(1);
    this.reviveInvulnerabilityMs = 1500;
    this.lastSafeX = primaryCloud.x;
    this.lastSafeY = playerStartY;

    return true;
  }

  // ─── Game Over ────────────────────────────────────────────────────────────

  private triggerGameOver() {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.physics.pause();
    this.player.setTexture("game-over");

    // Notify React layer
    if (this.gameOverCallback) {
      const stats: GameStats = {
        score: this.score,
        enemiesKilled: this.enemiesKilled,
        coinsCollected: this.coinsCollected,
        maxStage: this.bgStage,
        prayersUsed: this.prayersUsed,
        platformsReached: this.platformsSpawned,
      };
      this.time.delayedCall(600, () => {
        this.gameOverCallback!(stats);
      });
    }
  }

  // ─── Update loop ──────────────────────────────────────────────────────────

  update(_time: number, delta: number) {
    if (this.isGameOver || this.isPaused) return;
    const viewWidth = this.scale.width;

    // Continuous hold controls: press left/right zone to move in that direction.
    if (this.pointerDown && this.moveDir !== 0) {
      this.player.x += this.moveDir * HOLD_MOVE_SPEED * (delta / 1000);
    }

    // Screen wrap horizontal
    if (this.player.x < -10) this.player.x = viewWidth + 10;
    if (this.player.x > viewWidth + 10) this.player.x = -10;

    // Shoot cooldown
    if (this.shootCooldownMs > 0) {
      this.shootCooldownMs -= delta;
    }

    if (this.reviveInvulnerabilityMs > 0) {
      this.reviveInvulnerabilityMs -= delta;
      const blink = Math.floor(this.reviveInvulnerabilityMs / 80) % 2 === 0;
      this.player.setAlpha(blink ? 0.45 : 1);
      if (this.reviveInvulnerabilityMs <= 0) {
        this.reviveInvulnerabilityMs = 0;
        this.player.setAlpha(1);
      }
    }

    if (this.shootCooldownMs <= 0 && this.hasAutoShootTarget()) {
      this.shootLove();
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
      // Keep base height scoring stable regardless of temporary score multipliers.
      this.addScore(Math.floor(deltaY * 0.1), false);
    }

    // Generate more platforms ahead
    const cam = this.cameras.main as Phaser.Cameras.Scene2D.Camera;
    const cameraTop = cam.scrollY;
    while (this.nextPlatformY > cameraTop - 200) {
      this.spawnPlatform();
    }

    const cameraBottom = cam.scrollY + cam.height;

    if (this.player.y < cameraBottom - 24) {
      this.lastSafeX = this.player.x;
      this.lastSafeY = this.player.y;
    }

    // Prayer super boost countdown
    if (this.prayerBoostMs > 0) {
      this.prayerBoostMs -= delta;
      if (this.prayerBoostMs <= 0) {
        this.prayerBoostMs = 0;
        this.prayerBarFill.setFillStyle(0xffd700);
      }
    }

    // Cleanup clouds below camera
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
      const rightBound = enemy.getData('rightBound') as number ?? viewWidth - 20;
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

    // Cleanup social clouds
    this.cloudsSocial.getChildren().forEach((p) => {
      const sprite = p as Phaser.Physics.Arcade.Sprite;
      const label = sprite.getData('label') as Phaser.GameObjects.Text | undefined;
      if (sprite.y > cameraBottom + 200) {
        label?.destroy();
        sprite.destroy();
      }
    });

    // Game over if player falls below camera bottom
    if (this.player.y > cameraBottom + 60) {
      this.triggerGameOver();
    }
  }
}
