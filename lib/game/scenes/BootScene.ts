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
      text: "Loading Base Kitty...",
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
    this.load.image("idle", "/assets/idle.png");
    this.load.image("jump-up", "/assets/jump-up.png");
    this.load.image("fall-down", "/assets/fall-down.png");
    this.load.image("boost", "/assets/boost.png");
    this.load.image("game-over", "/assets/game-over.png");
    this.load.image("love", "/assets/love.jpeg");
    this.load.image("base-sphere", "/assets/base-sphere.jpeg");
  }

  create() {
    this.scene.start("GameScene");
  }
}
