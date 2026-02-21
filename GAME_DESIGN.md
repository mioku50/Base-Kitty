Base Kitty Jump - Game design and idea document
Farcaster/Base.
Котик прыгает вверх 3 фона-зоны, враги
медведи, темные тучки
Технический стек
- Движок: Phaser.js 3.x
- Фреймворк: Nextjs
- Wallet: Wagmi + Viem
- Farcaster: Neynar API
- Деплой: Vercel
  Технический стек
- Движок: Phaser.js 3.x
- Фреймворк: React + Vite
- Wallet: Wagmi + Viem
- Farcaster: Neynar API
- Деплой: Vercel

## Механики (подробно)
- Управление: drag влево-вправо
- Атака: тап = выстрел сердечком
- Платформы: облака
- Враги: 2 вида...
- Бонусы: 2 вида...

  
I want to make a game with mechanics similar to Doodle Jump! With my purple cat) and make the game as a MiniApp for Base.app /Farcaster!
The mechanics and logic are as follows.

Rising from "offline/Web2" to the shining "Onchain Heaven"
Platforms: These can be clouds.


Weapon — Love: The cat has heart-shaped eyes. When you tap the screen, it shoots "rays of love" or hearts at enemies (evil grey bears, internet trolls). If it hits, the enemy becomes kind and flies away, leaving a bonus.
Devil's tail: You can add a "whip" or hooking mechanic. If the cat falls, the player can swipe in time for the cat to hook its tail onto the nearest platform (given once per game).
Halo as a shield: When you pick up a bonus, the halo starts to glow neon (as in the second art), and the cat breaks through several platforms/enemies without taking damage.
Social height: On the fields that the cat flies past, there are "signs" (flags) with Farcaster players' avatars showing their records. The player sees: "Oh, I just beat Vitalik's record!" (If possible to implement)

Revive mechanic: Fallen down? A window appears: "Share your score to Farcaster to get a second chance!" This will give huge viral reach.
Loot collection: Instead of coins, the cat collects blue "Based Energy" spheres.
Leaderboard with rewards: Once a week, the top 10/50/100 players on the leaderboard receive an automatic mint of my $mioku token (I can provide the contract later).
Movement (Moving the cat):
* Drag & Slide: The player simply swipes left and right at the bottom of the screen, and the cat smoothly follows the finger horizontally. This gives perfect control and allows you to play with one hand (thumb) on the underground.
* The cat jumps up automatically when it touches the platform.
Attack (Shooting):
* Tap the screen: Since your finger is already on the screen for movement, a light tap (short press) with your second finger or a release + quick tap will cause the cat to shoot a "Love Beam" (heart) vertically upwards.
* If the cat crashes into an enemy from below or from the side, the game is over (Game Over).
* If the cat hits an enemy with a shot (heart), the enemy turns into a bonus (coin or cloud) and clears the way.
Types of enemies:

🐻 FUD Bear (basic)
The bear slowly patrols the platform from left to right. If the cat jumps on top of it, it is killed (like in Mario). If it touches it from the side, the cat loses a life. It can be killed with one heart.

1. "FUD Cloud" (Moving): A dark cloud that patrols the screen from left to right. Requires timing.
2. "Red Candle" (Obstacle): A red candlestick falling from above. It cannot be killed, you just need to dodge it.
*
* Background 1 (Start: 0 - 500 points): "Dark Room / Web2"
* Style: As on your 2nd screenshot (glowing neon frames, dark background, purple-blue tones). Feeling of enclosed space.
* Background 2 (Middle: 500 - 2000 points): "Farcaster Atmosphere"
Movement (Moving the cat):
* Drag & Slide: The player simply swipes left and right at the bottom of the screen, and the cat smoothly follows the finger horizontally. This gives perfect control and allows you to play with one hand (thumb) on the underground.
* The cat jumps up automatically when it touches the platform.
Attack (Shooting):
* Tap the screen: Since your finger is already on the screen for movement, a light tap (short press) with your second finger or a release + quick tap will cause the cat to shoot a "Love Beam" (heart) vertically upwards.
* If the cat crashes into an enemy from below or from the side, the game is over (Game Over).
* If the cat hits an enemy with a shot (heart), the enemy turns into a bonus (coin or cloud) and clears the way.
Types of enemies:

🐻 FUD Bear (basic)
The bear slowly patrols the platform from left to right. If the cat jumps on top of it, it is killed (like in Mario). If it touches it from the side, the cat loses a life. It can be killed with one heart.

1. "FUD Cloud" (Moving): A dark cloud that patrols the screen from left to right. Requires timing.
2. "Red Candle" (Obstacle): A red candlestick falling from above. It cannot be killed, you just need to dodge it.
*
* Background 1 (Start: 0 - 500 points): "Dark Room / Web2"
* Style: As on your 2nd screenshot (glowing neon frames, dark background, purple-blue tones). Feeling of enclosed space.

* Background 2 (Middle: 500 - 2000 points): "Farcaster Atmosphere"
