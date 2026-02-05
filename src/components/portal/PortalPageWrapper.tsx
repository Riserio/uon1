import { ReactNode } from "react";
import { usePortalCarouselOptional } from "@/contexts/PortalCarouselContext";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
};

export default function PortalPageWrapper({ children, className }: Props) {
  const carousel = usePortalCarouselOptional();
  
  const isTransitioning = carousel?.isTransitioning ?? false;
  const direction = carousel?.transitionDirection ?? 'right';

  return (
    <div 
      className={cn(
        "transition-all duration-300 ease-out",
        isTransitioning && direction === 'right' && "opacity-0 translate-x-8",
        isTransitioning && direction === 'left' && "opacity-0 -translate-x-8",
        !isTransitioning && "opacity-100 translate-x-0",
        className
      )}
    >
      {children}
    </div>
  );
}
