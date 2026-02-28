import Image from "next/image";

interface Props {
  size?: number;
  className?: string;
  alt?: string;
}

export default function KittyIcon({ size = 18, className = "", alt = "Kitty" }: Props) {
  return (
    <Image
      src="/assets/kitty-face.png"
      alt={alt}
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
