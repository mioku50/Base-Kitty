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
    // Remove black backgrounds from cat/boost sprites
    ["idle", "jump-up", "fall-down", "boost"].forEach((key) => {
      this.removeBlackBackground(key);
    });

    // Cloud platform texture (120x45)
    const cloudGfx = this.make.graphics({ x: 0, y: 0 });
    cloudGfx.fillStyle(0xccddee, 0.5);
    cloudGfx.fillEllipse(62, 38, 110, 22);
    cloudGfx.fillStyle(0xffffff, 1);
    cloudGfx.fillEllipse(60, 36, 108, 20);
    cloudGfx.fillEllipse(30, 28, 50, 36);
    cloudGfx.fillEllipse(60, 24, 60, 38);
    cloudGfx.fillEllipse(90, 28, 46, 30);
    cloudGfx.generateTexture("cloud-platform", 120, 45);
    cloudGfx.destroy();

    // FUD Bear texture (48x48)
    const bearGfx = this.make.graphics({ x: 0, y: 0 });
    bearGfx.fillStyle(0x555566, 1);
    bearGfx.fillEllipse(24, 28, 36, 32);
    bearGfx.fillStyle(0x555566, 1);
    bearGfx.fillCircle(24, 14, 14);
    bearGfx.fillStyle(0x444455, 1);
    bearGfx.fillCircle(14, 4, 7);
    bearGfx.fillCircle(34, 4, 7);
    bearGfx.fillStyle(0x883355, 1);
    bearGfx.fillCircle(14, 4, 4);
    bearGfx.fillCircle(34, 4, 4);
    bearGfx.fillStyle(0xff2222, 1);
    bearGfx.fillCircle(19, 13, 4);
    bearGfx.fillCircle(29, 13, 4);
    bearGfx.fillStyle(0x000000, 1);
    bearGfx.fillCircle(20, 13, 2);
    bearGfx.fillCircle(30, 13, 2);
    bearGfx.fillStyle(0x887788, 1);
    bearGfx.fillEllipse(24, 20, 14, 10);
    bearGfx.fillStyle(0x220022, 1);
    bearGfx.fillEllipse(24, 18, 6, 4);
    bearGfx.generateTexture("fud-bear", 48, 48);
    bearGfx.destroy();

    // FUD Cloud texture (90x50)
    const fudCloudGfx = this.make.graphics({ x: 0, y: 0 });
    fudCloudGfx.fillStyle(0x334455, 1);
    fudCloudGfx.fillEllipse(45, 38, 80, 24);
    fudCloudGfx.fillStyle(0x445566, 1);
    fudCloudGfx.fillEllipse(45, 36, 78, 22);
    fudCloudGfx.fillEllipse(22, 28, 40, 32);
    fudCloudGfx.fillEllipse(48, 22, 50, 36);
    fudCloudGfx.fillEllipse(70, 26, 38, 28);
    fudCloudGfx.fillStyle(0xffdd00, 1);
    fudCloudGfx.fillTriangle(42, 32, 48, 32, 44, 42);
    fudCloudGfx.fillTriangle(44, 40, 50, 40, 46, 50);
    fudCloudGfx.generateTexture("fud-cloud", 90, 50);
    fudCloudGfx.destroy();

    // Red Candle texture (24x60)
    const candleGfx = this.make.graphics({ x: 0, y: 0 });
    candleGfx.fillStyle(0xcc1111, 1);
    candleGfx.fillRect(6, 15, 12, 40);
    candleGfx.fillStyle(0xee2222, 1);
    candleGfx.fillRect(4, 10, 16, 8);
    candleGfx.fillStyle(0xff8800, 1);
    candleGfx.fillEllipse(12, 8, 8, 14);
    candleGfx.fillStyle(0xffff00, 1);
    candleGfx.fillEllipse(12, 9, 4, 8);
    candleGfx.fillStyle(0x991111, 1);
    candleGfx.fillRect(2, 52, 20, 8);
    candleGfx.generateTexture("red-candle", 24, 60);
    candleGfx.destroy();

    this.scene.start("GameScene");
  }

  private removeBlackBackground(textureKey: string) {
    const texture = this.textures.get(textureKey);
    const source = texture.getSourceImage() as HTMLImageElement;
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(source, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 30 && data[i + 1] < 30 && data[i + 2] < 30) {
        data[i + 3] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    this.textures.remove(textureKey);
    this.textures.addCanvas(textureKey, canvas);
  }
}
