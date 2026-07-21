import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

const swipeRoutes = ['/', '/calendar', '/homework', '/notes', '/courses', '/class-schedule', '/account'] as const;
const minSwipeDistance = 72;
const maxVerticalDrift = 64;

type SwipeDirection = 'left' | 'right' | null;

interface SwipeState {
  pointerId: number;
  startX: number;
  startY: number;
  cancelled: boolean;
}

function isMobileSwipeViewport() {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }

  const isSmallViewport = window.matchMedia('(max-width: 767px)').matches;
  const hasTouchInput = navigator.maxTouchPoints > 0 || window.matchMedia('(pointer: coarse)').matches;

  return isSmallViewport && hasTouchInput;
}

function isScrollableOnXAxis(element: Element) {
  const style = window.getComputedStyle(element);
  const canScrollX =
    ['auto', 'scroll'].includes(style.overflowX) ||
    (style.overflowX === 'visible' && ['auto', 'scroll'].includes(style.overflow));

  return canScrollX && element.scrollWidth > element.clientWidth + 2;
}

function shouldIgnoreSwipeTarget(target: EventTarget | null, boundary: HTMLElement) {
  if (!(target instanceof Element)) {
    return true;
  }

  const ignoredTarget = target.closest(
    [
      'a',
      'button',
      'input',
      'select',
      'textarea',
      '[contenteditable="true"]',
      '[role="button"]',
      '[role="dialog"]',
      '[data-mobile-swipe-ignore]',
      '.ProseMirror',
    ].join(',')
  );

  if (ignoredTarget) {
    return true;
  }

  let current: Element | null = target;
  while (current && current !== boundary) {
    if (isScrollableOnXAxis(current)) {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

function findRouteIndex(pathname: string) {
  return swipeRoutes.findIndex((route) => route === pathname);
}

function MobileSwipeNavigation({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const swipeState = useRef<SwipeState | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [transitionDirection, setTransitionDirection] = useState<SwipeDirection>(null);
  const routeIndex = findRouteIndex(location.pathname);
  const canSwipeRoute = routeIndex !== -1;

  useEffect(() => {
    if (!transitionDirection) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setTransitionDirection(null), 220);
    return () => window.clearTimeout(timeoutId);
  }, [transitionDirection, location.pathname]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (
      !container ||
      !canSwipeRoute ||
      !isMobileSwipeViewport() ||
      event.pointerType !== 'touch' ||
      shouldIgnoreSwipeTarget(event.target, container)
    ) {
      swipeState.current = null;
      return;
    }

    swipeState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cancelled: false,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const activeSwipe = swipeState.current;
    if (!activeSwipe || activeSwipe.pointerId !== event.pointerId) {
      return;
    }

    const distanceX = Math.abs(event.clientX - activeSwipe.startX);
    const distanceY = Math.abs(event.clientY - activeSwipe.startY);
    if (distanceY > maxVerticalDrift && distanceY > distanceX) {
      activeSwipe.cancelled = true;
    }
  };

  const finishSwipe = (event: PointerEvent<HTMLDivElement>) => {
    const activeSwipe = swipeState.current;
    swipeState.current = null;

    if (!activeSwipe || activeSwipe.pointerId !== event.pointerId || activeSwipe.cancelled || !canSwipeRoute) {
      return;
    }

    const deltaX = event.clientX - activeSwipe.startX;
    const deltaY = event.clientY - activeSwipe.startY;
    const distanceX = Math.abs(deltaX);
    const distanceY = Math.abs(deltaY);

    if (distanceX < minSwipeDistance || distanceX < distanceY * 1.35 || distanceY > maxVerticalDrift) {
      return;
    }

    const isSwipingLeft = deltaX < 0;
    const nextIndex = isSwipingLeft ? routeIndex + 1 : routeIndex - 1;
    const nextRoute = swipeRoutes[nextIndex];

    if (!nextRoute) {
      return;
    }

    setTransitionDirection(isSwipingLeft ? 'left' : 'right');
    navigate(nextRoute);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex min-h-0 flex-1 flex-col touch-pan-y',
        transitionDirection === 'left' && 'animate-mobile-swipe-left',
        transitionDirection === 'right' && 'animate-mobile-swipe-right'
      )}
      data-mobile-swipe-region={canSwipeRoute ? 'active' : 'inactive'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerCancel={() => {
        swipeState.current = null;
      }}
      onPointerUp={finishSwipe}
    >
      {children}
    </div>
  );
}

export default MobileSwipeNavigation;
