import React from 'react';
import { twMerge } from 'tailwind-merge';

interface BgImageProps {
  opacity: number;
  image: string;
  children: React.ReactNode;
  className?: string;
}

const BgImage: React.FC<BgImageProps> = ({ opacity, image, children, className }) => (
  <div className={twMerge("relative", className)}>
      {children}
    <div
      className="absolute inset-0 h-full w-full"
      style={{
        backgroundImage: `url('${image}')`,
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        opacity: opacity,
      }}
    ></div>
  </div>
);

export default BgImage;