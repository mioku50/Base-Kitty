# 🐱 Base Kitty Jump

Doodle Jump-style MiniApp для Farcaster. Играй за котика-нимба, прыгай по облакам, уничтожай медведей рынка и набирай очки!

**Стек:** Next.js · Phaser.js 3.x · TypeScript · TailwindCSS · Vercel

---

## 🎮 Механики игры

### Платформы (облака)
- **Обычное облако** — стандартный прыжок
- **Bouncy облако** (синее) — супер-прыжок, котик превращается в ракету
- **Хрупкое облако** — рассыпается при касании, даёт небольшой отскок
- Все облака **дрейфуют горизонтально**; скорость дрейфа растёт с уровнем:
  - Stage 0 (0–500 очков): 15–30 px/s
  - Stage 1 (500–1500): 30–55 px/s
  - Stage 2 (1500+): 55–85 px/s

### Главный герой
- Управление: зажать/тянуть палец — котик следует за курсором
- Двойной тап — выстрел сердечком вверх
- Котик меняет текстуру в зависимости от направления полёта

### Враги — FUD Bear 🐻
- Патрулирует свою платформу (движется влево-вправо, разворачивается у краёв)
- Каждые 2.5 секунды бросает красную свечу вниз
- Касание медведя или свечи → **Game Over**
- Попадание сердечком → медведь уничтожается, +50 очков
- С ростом счёта (каждые 200 очков): скорость патруля +5 px/s, интервал броска −100ms (минимум 1 сек)

### Предметы
- **Base Energy Coin** 🔵 — висит над платформой, +50 очков при сборе

### Шкала Молитвы 😇
- Золотая шкала в правом верхнем углу (0–100)
- Заполнение: убийство медведя **+2**, сбор монеты **+1**
- Когда шкала полная — появляется кнопка **"😇 Молитва!"** внизу экрана
- Нажатие: **все облака замораживаются на 10 секунд**
- После заморозки шкала сбрасывается до 0

### Очки и сложность
- Очки начисляются за высоту подъёма, убийства врагов и сбор монет
- Три фона сменяются по достижении 500 и 1500 очков
- Платформы становятся уже, расстояния больше, врагов больше

---

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
