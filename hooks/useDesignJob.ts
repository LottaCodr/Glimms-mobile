import { wsService } from '@/services/websocket.service';
import { useAuthStore } from '@/store/auth.store';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

export function useDesignJob(jobId: string | null) {
    const queryClient = useQueryClient();
    const { user} = useAuthStore();
    const subscribed = useRef(false);

    useEffect(() => {
        if (!jobId || !user || subscribed.current) return;
        subscribed.current = true;

        (async () => {
            const socket = await wsService.connect();
            socket.emit('subscribe:job', jobId);

            socket.on('job:update', (data: any) => {
                queryClient.setQueryData(['job', jobId], (old: any) =>
                    old ? { ...old, status: data.status } : old);
            });

            socket.on('job:complete', (result: any) => {
                queryClient.setQueryData(['job', jobId], (old: any) =>
                    old ? { ...old, status: 'COMPLETED', result } : old,);
                queryClient.invalidateQueries({ queryKey: ['jobs'] });
            });

            socket.on('job:failed', ({ error }: any) => {
                queryClient.setQueryData(['job', jobId], (old: any) =>
                    old ? { ...old, status: 'FAILED', errorMesg: error } : old);
            });
        })();

        return () => {
            subscribed.current = false;
            wsService.getSocket()?.off('job:update');
            wsService.getSocket()?.off('job:complete');
            wsService.getSocket()?.off('job:failed');
        };

    }, [jobId, user?.sub])
}