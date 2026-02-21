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

    // Load game assets from public/assets/
    this.load.image("idle", "/assets/Idle.PNG");
    this.load.image("jump-up", "/assets/Jump%20up.PNG");
    this.load.image("fall-down", "/assets/Fall%20Down.PNG");
    this.load.image("boost", "/assets/Boost.PNG");
    this.load.image("rocket", "/assets/Rocket%2C%20Wings.PNG");
    this.load.image("game-over", "/assets/Game%20Over.PNG");
    this.load.image("love", "/assets/Love%2C%20Shoot.PNG");
    this.load.image("shoot", "/assets/Shoot.png");
    this.load.image("energy-coin", "/assets/Based%20Energy%20Coin.PNG");
    this.load.image("base-cloud", "/assets/Base%20Cloud.PNG");
    this.load.image("fragile-cloud", "/assets/Fragile%20Cloud.PNG");
    this.load.image("bouncy-cloud", "/assets/Bouncy%20Cloud%2C%20Super%20Jump.PNG");
    this.load.image("bear-market", "/assets/Bear%20Market.PNG");
    this.load.image("level1", "/assets/Level%201%20%2CStart.PNG");
    this.load.image("level2", "/assets/LeVel%202.PNG");
    this.load.image("level3", "/assets/Level%203%2B.PNG");
  }

  create() {
    this.scene.start("GameScene");
  }
}
