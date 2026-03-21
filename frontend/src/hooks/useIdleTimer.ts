import { useState, useEffect, useCallback, useRef } from 'react';

interface IdleTimerOptions {
  timeout: number; // In milliseconds
  warningThreshold: number; // In milliseconds (when to show the warning)
}

export function useIdleTimer({ timeout, warningThreshold }: IdleTimerOptions) {
  const [isIdle, setIsIdle] = useState(false);
  const [isWarning, setIsWarning] = useState(false);
  const [remainingTime, setRemainingTime] = useState(Math.floor((timeout - warningThreshold) / 1000));
  
  const timerRef = useRef<number | null>(null);
  const warningTimerRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  const resetTimer = useCallback(() => {
    // Clear all timers
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (warningTimerRef.current) window.clearTimeout(warningTimerRef.current);
    if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current);

    setIsIdle(false);
    setIsWarning(false);
    setRemainingTime(Math.floor((timeout - warningThreshold) / 1000));

    // Wait until warning threshold
    warningTimerRef.current = window.setTimeout(() => {
      setIsWarning(true);
      
      // Start countdown
      let count = Math.floor((timeout - warningThreshold) / 1000);
      setRemainingTime(count);
      
      countdownIntervalRef.current = window.setInterval(() => {
        count -= 1;
        setRemainingTime(count);
        if (count <= 0) {
          if (countdownIntervalRef.current) window.clearInterval(countdownIntervalRef.current);
        }
      }, 1000);
    }, warningThreshold);

    // Final timeout
    timerRef.current = window.setTimeout(() => {
      setIsIdle(true);
      setIsWarning(false);
    }, timeout);
  }, [timeout, warningThreshold]);

  useEffect(() => {
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    
    // Standard reset on any event
    const activityHandler = () => {
      if (!isWarning) {
        resetTimer();
      }
    };

    activityEvents.forEach((event) => {
      window.addEventListener(event, activityHandler);
    });

    // Initial start
    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      
      activityEvents.forEach((event) => {
        window.removeEventListener(event, activityHandler);
      });
    };
  }, [resetTimer, isWarning]);

  return {
    isIdle,
    isWarning,
    remainingTime,
    resetTimer
  };
}
