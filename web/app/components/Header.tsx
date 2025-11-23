'use client';

import { useState } from 'react';
import { VFXProvider, VFXImg, VFXSpan } from "react-vfx";

export function Header() {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <VFXProvider>
      <div className="mb-12">
        <div className="flex items-center gap-4 mb-4">
          <VFXImg
            src="/images/dmm-fast-transparent.png"
            alt="Little DMM"
            width={64}
            height={64}
            className="object-contain"
            shader={isHovered ? "rgbShift" : "none"}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          />
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white cursor-pointer">
            <VFXSpan
              shader={isHovered ? "rgbShift" : "none"}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >Dark Matter Markets</VFXSpan>
          </h1>
        </div>
        <p className="text-baseline italic leading-8 text-white mb-8">
          Alien incentives. Human rewards.
        </p>
        <div>
          <a
            href="/agents"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Interrogate Agents→
          </a>
        </div>
      </div>
    </VFXProvider>
  );
}

