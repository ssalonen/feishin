import isElectron from 'is-electron';
import { nanoid } from 'nanoid/non-secure';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';

import { api } from '/@/renderer/api';
import { PageHeader } from '/@/renderer/components/page-header/page-header';
import {
    findExistingServerLockServer,
    normalizeServerUrl,
} from '/@/renderer/features/action-required/utils/server-lock';
import {
    isLegacyAuth,
    isServerLock,
} from '/@/renderer/features/action-required/utils/window-properties';
import JellyfinIcon from '/@/renderer/features/servers/assets/jellyfin.png';
import NavidromeIcon from '/@/renderer/features/servers/assets/navidrome.png';
import SubsonicIcon from '/@/renderer/features/servers/assets/opensubsonic.png';
import { IgnoreCorsSslSwitches } from '/@/renderer/features/servers/components/ignore-cors-ssl-switches';
import { AnimatedPage } from '/@/renderer/features/shared/components/animated-page';
import { PageErrorBoundary } from '/@/renderer/features/shared/components/page-error-boundary';
import { AppRoute } from '/@/renderer/router/routes';
import {
    getServerById,
    useAuthStore,
    useAuthStoreActions,
    useCurrentServer,
    useServerList,
} from '/@/renderer/store';
import { Button } from '/@/shared/components/button/button';
import { Center } from '/@/shared/components/center/center';
import { Code } from '/@/shared/components/code/code';
import { Paper } from '/@/shared/components/paper/paper';
import { PasswordInput } from '/@/shared/components/password-input/password-input';
import { Stack } from '/@/shared/components/stack/stack';
import { TextInput } from '/@/shared/components/text-input/text-input';
import { TextTitle } from '/@/shared/components/text-title/text-title';
import { Text } from '/@/shared/components/text/text';
import { toast } from '/@/shared/components/toast/toast';
import { useForm } from '/@/shared/hooks/use-form';
import { AuthenticationResponse, ServerListItemWithCredential } from '/@/shared/types/domain-types';
import { ServerType, toServerType } from '/@/shared/types/types';

const localSettings = isElectron() ? window.api.localSettings : null;

const SERVER_ICONS: Record<ServerType, string> = {
    [ServerType.JELLYFIN]: JellyfinIcon,
    [ServerType.NAVIDROME]: NavidromeIcon,
    [ServerType.SUBSONIC]: SubsonicIcon,
};

const SERVER_NAMES: Record<ServerType, string> = {
    [ServerType.JELLYFIN]: 'Jellyfin',
    [ServerType.NAVIDROME]: 'Navidrome',
    [ServerType.SUBSONIC]: 'OpenSubsonic',
};

const LoginRoute = () => {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(false);
    const { addServer, deleteServer, setCurrentServer, updateServer } = useAuthStoreActions();
    const currentServer = useCurrentServer();
    const serverList = useServerList();

    // Check if server lock is configured
    const serverLock = isServerLock();
    const serverType = window.SERVER_TYPE ? toServerType(window.SERVER_TYPE) : null;
    const serverName = window.SERVER_NAME || '';
    const serverUrl = window.SERVER_URL || '';
    const remoteUrl = window.REMOTE_URL || '';
    const legacyAuth = serverLock && isLegacyAuth();

    const config = [
        {
            isValid: true,
            key: 'SERVER_LOCK',
            value: serverLock,
        },
        {
            isValid: serverType !== null,
            key: 'SERVER_TYPE',
            value: serverType,
        },
        {
            isValid: true,
            key: 'SERVER_NAME',
            value: serverName,
        },
        {
            isValid: serverUrl !== '',
            key: 'SERVER_URL',
            value: serverUrl,
        },
        {
            isValid: true,
            key: 'REMOTE_URL',
            value: remoteUrl,
        },
    ];

    const form = useForm({
        initialValues: {
            password: '',
            username: '',
        },
    });

    const [quickConnectCode, setQuickConnectCode] = useState<string | null>(null);
    const [isQuickConnectLoading, setIsQuickConnectLoading] = useState(false);
    const quickConnectInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        return () => {
            if (quickConnectInterval.current) clearInterval(quickConnectInterval.current);
        };
    }, []);

    const stopQuickConnect = () => {
        if (quickConnectInterval.current) {
            clearInterval(quickConnectInterval.current);
            quickConnectInterval.current = null;
        }
        setQuickConnectCode(null);
        setIsQuickConnectLoading(false);
    };

    const handleQuickConnect = async () => {
        if (!serverUrl) return;

        setIsQuickConnectLoading(true);
        setQuickConnectCode(null);

        let result: { code: string; secret: string };
        try {
            result = await api.controller.quickConnectInitiate(serverUrl);
        } catch (err: any) {
            setIsQuickConnectLoading(false);
            return toast.error({ message: err?.message ?? t('error.quickConnectNotActive', { defaultValue: 'Quick Connect is not active on this server' }) });
        }

        setQuickConnectCode(result.code);
        setIsQuickConnectLoading(false);

        quickConnectInterval.current = setInterval(async () => {
            try {
                const authenticated = await api.controller.quickConnectState(serverUrl, result.secret);
                if (!authenticated) return;

                stopQuickConnect();

                const data = await api.controller.authenticateWithQuickConnect(serverUrl, result.secret);
                if (!data) {
                    return toast.error({ message: t('error.authenticationFailed') });
                }

                const normalizedUrl = normalizeServerUrl(serverUrl);
                const normalizedRemoteURL = normalizeServerUrl(remoteUrl);
                const existingServer = serverLock
                    ? findExistingServerLockServer(serverList, normalizedUrl, serverType)
                    : undefined;

                const serverId = existingServer?.id ?? nanoid();
                const serverItem: ServerListItemWithCredential = {
                    credential: data.credential,
                    id: serverId,
                    isAdmin: data.isAdmin,
                    name: serverName,
                    remoteUrl: normalizedRemoteURL,
                    type: serverType as ServerType,
                    url: normalizedUrl,
                    userId: data.userId,
                    username: data.username,
                };

                if (existingServer) {
                    updateServer(existingServer.id, {
                        credential: data.credential,
                        isAdmin: data.isAdmin,
                        name: serverName,
                        remoteUrl: normalizedRemoteURL,
                        url: normalizedUrl,
                        userId: data.userId,
                        username: data.username,
                    });
                    const updated = getServerById(existingServer.id);
                    if (updated) setCurrentServer(updated);
                } else {
                    addServer(serverItem);
                    setCurrentServer(serverItem);
                }

                if (serverLock) {
                    Object.values(useAuthStore.getState().serverList).forEach((server) => {
                        if (server.id !== serverId) deleteServer(server.id);
                    });
                }

                toast.success({ message: t('form.addServer.success') });
            } catch (err: any) {
                stopQuickConnect();
                toast.error({ message: err?.message ?? t('error.quickConnectDeactivated', { defaultValue: 'Quick Connect request expired' }) });
            }
        }, 5000);
    };

    // If server lock is not enabled, or we already have a server, redirect to home
    if (currentServer) {
        return <Navigate replace to={AppRoute.HOME} />;
    }

    // If any of the config values are invalid, show error
    if (config.some((c) => !c.isValid)) {
        return (
            <AnimatedPage>
                <PageHeader />
                <Center style={{ height: '100%', width: '100vw' }}>
                    <Stack>
                        <TextTitle fw={600}>{t('error.genericError')}</TextTitle>
                        <Text fw={500}>{t('error.serverNotSelectedError')}</Text>
                        <Code block>{JSON.stringify(config, null, 2)}</Code>
                    </Stack>
                </Center>
            </AnimatedPage>
        );
    }

    const handleSubmit = form.onSubmit(async (values) => {
        const authFunction = api.controller.authenticate;

        if (!authFunction) {
            return toast.error({
                message: t('error.invalidServer'),
            });
        }

        try {
            setIsLoading(true);
            const data: AuthenticationResponse | undefined = await authFunction(
                serverUrl,
                {
                    legacy: legacyAuth,
                    password: values.password,
                    username: values.username,
                },
                serverType as ServerType,
            );

            if (!data) {
                return toast.error({
                    message: t('error.authenticationFailed'),
                });
            }

            const normalizedUrl = normalizeServerUrl(serverUrl);
            const normalizedRemoteURL = normalizeServerUrl(remoteUrl);
            const existingServer = serverLock
                ? findExistingServerLockServer(serverList, normalizedUrl, serverType)
                : undefined;

            const serverId = existingServer?.id ?? nanoid();
            const serverItem: ServerListItemWithCredential = {
                credential: data.credential,
                id: serverId,
                isAdmin: data.isAdmin,
                name: serverName,
                remoteUrl: normalizedRemoteURL,
                type: serverType as ServerType,
                url: normalizedUrl,
                userId: data.userId,
                username: data.username,
            };

            if (existingServer) {
                const updates: Partial<ServerListItemWithCredential> = {
                    credential: data.credential,
                    isAdmin: data.isAdmin,
                    name: serverName,
                    remoteUrl: normalizedRemoteURL,
                    url: normalizedUrl,
                    userId: data.userId,
                    username: data.username,
                };
                if (data.ndCredential !== undefined) {
                    updates.ndCredential = data.ndCredential;
                }
                updateServer(existingServer.id, updates);
                const updated = getServerById(existingServer.id);
                if (updated) setCurrentServer(updated);
            } else {
                if (data.ndCredential !== undefined) {
                    serverItem.ndCredential = data.ndCredential;
                }
                addServer(serverItem);
                setCurrentServer(serverItem);
            }

            if (serverLock) {
                Object.values(useAuthStore.getState().serverList).forEach((server) => {
                    if (server.id !== serverId) {
                        deleteServer(server.id);
                    }
                });
            }

            toast.success({
                message: t('form.addServer.success'),
            });

            if (localSettings && values.password) {
                const saved = await localSettings.passwordSet(values.password, serverId);
                if (!saved) {
                    toast.error({
                        message: t('form.addServer.error', {
                            context: 'savePassword',
                        }),
                    });
                }
            }
        } catch (err: any) {
            setIsLoading(false);
            return toast.error({ message: err?.message });
        }

        return setIsLoading(false);
    });

    const isSubmitDisabled = !form.values.username || !form.values.password;
    const serverIcon = SERVER_ICONS[serverType as ServerType];
    const serverDisplayName = SERVER_NAMES[serverType as ServerType];

    return (
        <AnimatedPage>
            <PageHeader />
            <Center style={{ height: '100%', width: '100vw' }}>
                <Paper p="xl" style={{ maxWidth: '400px', width: '100%' }}>
                    <form onSubmit={handleSubmit}>
                        <Stack gap="xl">
                            <Stack align="center" gap="md">
                                <img
                                    alt={serverDisplayName}
                                    height="80"
                                    src={serverIcon}
                                    width="80"
                                />
                                <Text fw={600} size="xl">
                                    {serverName}
                                </Text>
                                {serverName && (
                                    <Text c="dimmed" size="sm">
                                        {serverDisplayName}
                                    </Text>
                                )}
                            </Stack>

                            <Stack gap="md">
                                <TextInput
                                    data-autofocus
                                    label={t('form.addServer.input', {
                                        context: 'username',
                                    })}
                                    required
                                    variant="filled"
                                    {...form.getInputProps('username')}
                                />
                                <PasswordInput
                                    label={t('form.addServer.input', {
                                        context: 'password',
                                    })}
                                    required
                                    variant="filled"
                                    {...form.getInputProps('password')}
                                />
                                <IgnoreCorsSslSwitches />
                            </Stack>

                            <Button
                                disabled={isSubmitDisabled}
                                fullWidth
                                loading={isLoading}
                                type="submit"
                                variant="filled"
                            >
                                {t('common.login', {
                                    defaultValue: 'Login',
                                })}
                            </Button>
                            {serverType === ServerType.JELLYFIN && (
                                <Stack gap="xs">
                                    <Button
                                        fullWidth
                                        loading={isQuickConnectLoading}
                                        variant="subtle"
                                        onClick={quickConnectCode ? stopQuickConnect : handleQuickConnect}
                                    >
                                        {quickConnectCode
                                            ? t('common.cancel', { defaultValue: 'Cancel' })
                                            : t('form.addServer.input', { context: 'quickConnect', defaultValue: 'Quick Connect' })}
                                    </Button>
                                    {quickConnectCode && (
                                        <Text c="dimmed" size="sm" ta="center">
                                            {t('form.addServer.input', {
                                                code: quickConnectCode,
                                                context: 'quickConnectCode',
                                                defaultValue: `Enter code {{code}} in your Jellyfin web UI to authorize`,
                                            })}
                                        </Text>
                                    )}
                                </Stack>
                            )}
                        </Stack>
                    </form>
                </Paper>
            </Center>
        </AnimatedPage>
    );
};

const LoginRouteWithBoundary = () => {
    return (
        <PageErrorBoundary>
            <LoginRoute />
        </PageErrorBoundary>
    );
};

export default LoginRouteWithBoundary;
