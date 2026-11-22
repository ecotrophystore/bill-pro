import { useEffect, useRef } from 'react';
import {
  getFollowupAutomationConfig,
  getTodayDateIST,
  executeFollowupMorningDispatch
} from '../services/whatsappFollowupAutomationService';

/**
 * Hook to automatically check and run the 7:30 AM Follow-Up automation
 * when the app is active in the browser.
 */
export function useWhatsAppFollowupScheduler() {
  const isRunningRef = useRef(false);

  useEffect(() => {
    const checkAndRunSchedule = async () => {
      if (isRunningRef.current) return;

      try {
        const config = await getFollowupAutomationConfig();
        if (!config.enabled) return;

        // Current time in IST (Asia/Kolkata)
        const now = new Date();
        const istFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Kolkata',
          hour: 'numeric',
          minute: 'numeric',
          hour12: false
        });
        const parts = istFormatter.formatToParts(now);
        const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
        const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);

        const [schedHour, schedMinute] = (config.scheduleTime || '07:30').split(':').map(Number);

        // Check if current IST time is at or after 7:30 AM
        const isTimeDue = hour > schedHour || (hour === schedHour && minute >= schedMinute);

        const todayIST = getTodayDateIST();
        const hasRunToday = config.lastRunDate === todayIST;

        if (isTimeDue && !hasRunToday) {
          console.log('[FollowUp Scheduler] 7:30 AM IST Follow-Up is due. Executing automatic dispatch...');
          isRunningRef.current = true;
          await executeFollowupMorningDispatch({ force: false });
          isRunningRef.current = false;
        }
      } catch (err) {
        console.warn('[FollowUp Scheduler] Error checking schedule:', err);
        isRunningRef.current = false;
      }
    };

    // Run check on mount
    checkAndRunSchedule();

    // Check periodically every 60 seconds
    const interval = setInterval(checkAndRunSchedule, 60 * 1000);
    return () => clearInterval(interval);
  }, []);
}

