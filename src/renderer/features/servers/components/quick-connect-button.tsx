import { useTranslation } from 'react-i18next';

import { ActionIcon } from '/@/shared/components/action-icon/action-icon';
import { Button } from '/@/shared/components/button/button';
import { CopyButton } from '/@/shared/components/copy-button/copy-button';
import { Group } from '/@/shared/components/group/group';
import { Icon } from '/@/shared/components/icon/icon';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { Tooltip } from '/@/shared/components/tooltip/tooltip';

interface QuickConnectButtonProps {
    code: null | string;
    disabled?: boolean;
    isLoading: boolean;
    onStart: () => void;
    onStop: () => void;
}

/**
 * Renders the Quick Connect toggle button and, once a code has been
 * requested, the code itself along with a one-click copy action. Shared
 * between the login route and the add server form so the two flows stay in
 * sync.
 */
export const QuickConnectButton = ({
    code,
    disabled,
    isLoading,
    onStart,
    onStop,
}: QuickConnectButtonProps) => {
    const { t } = useTranslation();

    return (
        <Stack gap="xs">
            <Button
                disabled={disabled}
                fullWidth
                loading={isLoading}
                onClick={code ? onStop : onStart}
                variant="subtle"
            >
                {code
                    ? t('common.cancel', { defaultValue: 'Cancel' })
                    : t('form.addServer.input', {
                          context: 'quickConnect',
                          defaultValue: 'Quick Connect',
                      })}
            </Button>
            {code && (
                <Group gap={4} justify="center">
                    <Text c="dimmed" size="sm" ta="center">
                        {t('form.addServer.input', {
                            code,
                            context: 'quickConnectCode',
                            defaultValue:
                                'Enter code {{code}} in your Jellyfin web UI to authorize',
                        })}
                    </Text>
                    <CopyButton timeout={2000} value={code}>
                        {({ copied, copy }) => (
                            <Tooltip
                                label={t('form.addServer.input', {
                                    context: copied
                                        ? 'quickConnectCodeCopied'
                                        : 'quickConnectCodeCopy',
                                    defaultValue: copied ? 'Copied' : 'Copy code',
                                })}
                                withinPortal
                            >
                                <ActionIcon onClick={copy} size="sm" variant="transparent">
                                    {copied ? <Icon icon="check" /> : <Icon icon="clipboardCopy" />}
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </CopyButton>
                </Group>
            )}
        </Stack>
    );
};
