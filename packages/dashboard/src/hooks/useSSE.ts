import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/react';

export function useSSE(
  runId: string | undefined,
  onEvent: (event: any) => void,
  onReconnect?: () => void
) {
  const { getToken } = useAuth();
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onReconnectRef = useRef(onReconnect);
  onReconnectRef.current = onReconnect;

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let isAborted = false;
    let reconnectTimeoutId: any = null;

    async function connect() {
      try {
        const token = await getToken();
        if (isAborted) return;
        if (!token) {
          console.warn('Could not establish SSE: clerk token is missing');
          reconnectTimeoutId = setTimeout(connect, 2000);
          return;
        }

        const url = new URL('http://localhost:3000/api/events/stream');
        if (runId) {
          url.searchParams.set('runId', runId);
        }
        url.searchParams.set('token', token);

        eventSource = new EventSource(url.toString());

        const eventTypes = [
          'step.queued',
          'step.started',
          'step.succeeded',
          'step.failed',
          'step.retrying',
          'step.dead_lettered',
          'step.cancelled',
          'workflow.completed',
          'workflow.failed',
          'workflow.cancelled',
          'run.trigger'
        ];

        eventTypes.forEach((type) => {
          eventSource?.addEventListener(type, (e) => {
            try {
              const data = JSON.parse(e.data);
              onEventRef.current(data);
            } catch (err) {
              console.error('Failed to parse SSE event data', err);
            }
          });
        });

        eventSource.onerror = () => {
          console.warn('SSE EventSource disconnected. Triggering REST re-sync and reconnecting in 2s...');
          if (onReconnectRef.current) {
            try {
              onReconnectRef.current();
            } catch (err) {
              console.error('Error in SSE onReconnect callback', err);
            }
          }
          eventSource?.close();
          eventSource = null;
          if (!isAborted) {
            reconnectTimeoutId = setTimeout(connect, 2000);
          }
        };

      } catch (err) {
        console.error('Failed to connect to SSE, retrying in 2s...', err);
        if (!isAborted) {
          reconnectTimeoutId = setTimeout(connect, 2000);
        }
      }
    }

    connect();

    return () => {
      isAborted = true;
      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId);
      }
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [runId, getToken]);
}

export function useGlobalSSE(onEvent: (event: any) => void, onReconnect?: () => void) {
  useSSE(undefined, onEvent, onReconnect);
}
