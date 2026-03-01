import * as Phaser from "phaser";

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload() {
    // Show a simple loading bar
    const width = this.scale.width;
    const height = this.scale.height;

    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50);

    const loadingText = this.make.text({
      x: width / 2,
      y: height / 2 - 50,
      text: "Loading Nimbus Ascent...",
      style: { font: "20px monospace", color: "#ffffff" },
    });
    loadingText.setOrigin(0.5, 0.5);

    this.load.on("progress", (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0x9b59b6, 1);
      progressBar.fillRect(width / 2 - 150, height / 2 - 15, 300 * value, 30);
    });

    this.load.on("complete", () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
    });

    // Load game assets
    this.load.image("idle",          "/assets/Idle.PNG");
    this.load.image("jump-up",       "/assets/Jump up.PNG");
    this.load.image("fall-down",     "/assets/Fall Down.PNG");
    this.load.image("game-over",     "/assets/Game Over.PNG");
    this.load.image("love",          "/assets/Love, Shoot.PNG");
    this.load.image("base-sphere",   "/assets/Based Energy Coin.PNG");
    this.load.image("boost",         "/assets/Boost.PNG");
    this.load.image("rocket",        "/assets/Rocket, Wings.PNG");
    this.load.image("cloud-normal",  "/assets/Base Cloud.PNG");
    this.load.image("cloud-bouncy",  "/assets/Bouncy Cloud, Super Jump.PNG");
    this.load.image("cloud-fragile", "/assets/Fragile Cloud.PNG");
    this.load.image("fud-bear",      "/assets/Bear Market.PNG");
    this.load.image("bg-stage0",     "/assets/Level 1 ,Start.PNG");
    this.load.image("bg-stage1",     "/assets/LeVel 2.PNG");
    this.load.image("bg-stage2",     "/assets/Level 3+.PNG");
  }

  create() {
    this.scene.start("GameScene");
  }
}
