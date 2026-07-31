import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { api } from '/@/renderer/api';
import { toast } from '/@/shared/components/toast/toast';
import { AuthenticationResponse } from '/@/shared/types/domain-types';

interface UseQuickConnectProps {
    onAuthenticated: (data: AuthenticationResponse) => Promise<void> | void;
}

/**
 * Encapsulates the Jellyfin Quick Connect flow: initiating a request, polling
 * the server for authorization, and completing the login once approved.
 *
 * The caller is only responsible for what happens once authentication
 * succeeds (`onAuthenticated`), since that differs between the login route
 * and the add server form.
 */
export function useQuickConnect({ onAuthenticated }: UseQuickConnectProps) {
    const { t } = useTranslation();
    const [code, setCode] = useState<null | string>(null);
    const [isLoading, setIsLoading] = useState(false);
    const intervalRef = useRef<null | ReturnType<typeof setInterval>>(null);

    useEffect(() => {
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, []);

    const stop = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        setCode(null);
        setIsLoading(false);
    };

    const start = async (url: string) => {
        if (!url) return;

        setIsLoading(true);
        setCode(null);

        let result: { code: string; secret: string };
        try {
            result = await api.controller.quickConnectInitiate(url);
        } catch (err: any) {
            setIsLoading(false);
            toast.error({
                message:
                    err?.message ??
                    t('error.quickConnectNotActive', {
                        defaultValue: 'Quick Connect is not active on this server',
                    }),
            });
            return;
        }

        setCode(result.code);
        setIsLoading(false);

        intervalRef.current = setInterval(async () => {
            try {
                const authenticated = await api.controller.quickConnectState(url, result.secret);
                if (!authenticated) return;

                stop();

                const data = await api.controller.authenticateWithQuickConnect(url, result.secret);
                if (!data) {
                    toast.error({ message: t('error.authenticationFailed') });
                    return;
                }

                await onAuthenticated(data);
            } catch (err: any) {
                stop();
                toast.error({
                    message:
                        err?.message ??
                        t('error.quickConnectDeactivated', {
                            defaultValue: 'Quick Connect request expired',
                        }),
                });
            }
        }, 5000);
    };

    return { code, isLoading, start, stop };
}
