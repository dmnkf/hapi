import type { ApiClient } from '@/api/client'
import type { ReactNode } from 'react'
import type { ConversationOutlineItem } from '@/chat/outline'
import type { ActivityApprovalItem, ActivityFileItem, ActivityToolItem, SessionActivity } from '@/chat/activity'
import type { SessionMetadataSummary } from '@/types/api'
import { Button } from '@/components/ui/button'
import { CloseIcon } from '@/components/icons'
import { Spinner } from '@/components/Spinner'
import { PermissionFooter } from '@/components/ToolCard/PermissionFooter'
import { AskUserQuestionFooter } from '@/components/ToolCard/AskUserQuestionFooter'
import { RequestUserInputFooter } from '@/components/ToolCard/RequestUserInputFooter'
import { isAskUserQuestionToolName } from '@/components/ToolCard/askUserQuestion'
import { isRequestUserInputToolName } from '@/components/ToolCard/requestUserInput'
import { useTranslation } from '@/lib/use-translation'

function Section(props: { title: string; count?: number; children: ReactNode }) {
    return (
        <section className="border-t border-[var(--app-border)] px-3 py-3 first:border-t-0">
            <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-normal text-[var(--app-hint)]">
                    {props.title}
                </h2>
                {typeof props.count === 'number' ? (
                    <span className="rounded-full bg-[var(--app-subtle-bg)] px-2 py-0.5 text-[11px] text-[var(--app-hint)]">
                        {props.count}
                    </span>
                ) : null}
            </div>
            {props.children}
        </section>
    )
}

function EmptySection(props: { text: string }) {
    return (
        <div className="rounded-md border border-dashed border-[var(--app-border)] px-3 py-4 text-center text-sm text-[var(--app-hint)]">
            {props.text}
        </div>
    )
}

function RowButton(props: {
    title: string
    subtitle?: string | null
    meta?: string | null
    onClick?: () => void
    children?: ReactNode
}) {
    const content = (
        <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-medium text-[var(--app-fg)]">{props.title}</div>
            {props.subtitle ? (
                <div className="mt-0.5 truncate font-mono text-[11px] text-[var(--app-hint)]">{props.subtitle}</div>
            ) : null}
            {props.meta ? (
                <div className="mt-1 text-[11px] text-[var(--app-hint)]">{props.meta}</div>
            ) : null}
        </div>
    )

    if (!props.onClick) {
        return (
            <div className="rounded-md bg-[var(--app-secondary-bg)] px-3 py-2">
                {content}
                {props.children}
            </div>
        )
    }

    return (
        <div className="rounded-md bg-[var(--app-secondary-bg)] px-3 py-2">
            <button
                type="button"
                onClick={props.onClick}
                className="flex w-full min-w-0 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]"
            >
                {content}
                <span className="shrink-0 text-[var(--app-hint)]" aria-hidden="true">›</span>
            </button>
            {props.children}
        </div>
    )
}

function ApprovalRow(props: {
    api: ApiClient
    sessionId: string
    metadata: SessionMetadataSummary | null
    item: ActivityApprovalItem
    disabled: boolean
    onDone: () => void
    onJump: (targetToolId: string) => void
}) {
    const { t } = useTranslation()
    const isAskUserQuestion = isAskUserQuestionToolName(props.item.tool.name)
    const isRequestUserInput = isRequestUserInputToolName(props.item.tool.name)

    return (
        <RowButton
            title={props.item.title}
            subtitle={props.item.subtitle}
            meta={props.item.targetToolId ? t('session.activity.tapToJump') : null}
            onClick={props.item.targetToolId ? () => props.onJump(props.item.targetToolId!) : undefined}
        >
            <div className="mt-2 border-t border-[var(--app-border)] pt-2">
                {isAskUserQuestion ? (
                    <AskUserQuestionFooter
                        api={props.api}
                        sessionId={props.sessionId}
                        tool={props.item.tool}
                        disabled={props.disabled}
                        onDone={props.onDone}
                    />
                ) : isRequestUserInput ? (
                    <RequestUserInputFooter
                        api={props.api}
                        sessionId={props.sessionId}
                        tool={props.item.tool}
                        disabled={props.disabled}
                        onDone={props.onDone}
                    />
                ) : (
                    <PermissionFooter
                        api={props.api}
                        sessionId={props.sessionId}
                        metadata={props.metadata}
                        tool={props.item.tool}
                        disabled={props.disabled}
                        onDone={props.onDone}
                    />
                )}
            </div>
        </RowButton>
    )
}

function ToolRow(props: { item: ActivityToolItem; onJump: (targetToolId: string) => void }) {
    return (
        <RowButton
            title={props.item.title}
            subtitle={props.item.subtitle}
            meta={props.item.state === 'running' ? props.item.toolName : `${props.item.toolName} · ${props.item.state}`}
            onClick={() => props.onJump(props.item.targetToolId)}
        />
    )
}

function FileRow(props: { item: ActivityFileItem; onJump: (targetToolId: string) => void }) {
    return (
        <RowButton
            title={props.item.path}
            meta={`${props.item.action} · ${props.item.toolName}`}
            onClick={() => props.onJump(props.item.targetToolId)}
        />
    )
}

export function ActivitySheet(props: {
    open: boolean
    api: ApiClient
    sessionId: string
    metadata: SessionMetadataSummary | null
    disabled: boolean
    activity: SessionActivity
    backgroundTaskCount?: number
    outlineTitle: string
    outlineItems: readonly ConversationOutlineItem[]
    hasMoreMessages: boolean
    isLoadingMoreMessages: boolean
    onLoadMore: () => void
    onSelectOutline: (item: ConversationOutlineItem) => void
    onJumpToTool: (targetToolId: string) => void
    onRefresh: () => void
    onClose: () => void
}) {
    const { t } = useTranslation()

    if (!props.open) return null

    const hasWork = props.activity.approvals.length > 0
        || props.activity.runningTools.length > 0
        || (props.backgroundTaskCount ?? 0) > 0
        || props.activity.files.length > 0
        || props.activity.recentTools.length > 0
        || props.outlineItems.length > 0

    return (
        <>
            <button
                type="button"
                className="absolute inset-0 z-30 bg-black/25"
                aria-label={t('session.activity.close')}
                onClick={props.onClose}
            />
            <aside
                className="absolute inset-x-0 bottom-0 z-40 mx-auto flex max-h-[86%] w-full max-w-content flex-col overflow-hidden rounded-t-xl border border-[var(--app-border)] bg-[var(--app-bg)] shadow-2xl sm:inset-y-3 sm:right-3 sm:left-auto sm:max-h-none sm:w-[24rem] sm:rounded-xl"
                aria-label={t('session.activity.title')}
            >
                <div className="flex items-start gap-3 border-b border-[var(--app-border)] p-3">
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{t('session.activity.title')}</div>
                        <div className="mt-0.5 truncate text-xs text-[var(--app-hint)]">{props.outlineTitle}</div>
                    </div>
                    <button
                        type="button"
                        onClick={props.onClose}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                        aria-label={t('button.close')}
                        title={t('button.close')}
                    >
                        <CloseIcon className="h-4 w-4" />
                    </button>
                </div>

                <div className="app-scroll-y min-h-0 flex-1">
                    {!hasWork ? (
                        <div className="p-3">
                            <EmptySection text={t('session.activity.empty')} />
                        </div>
                    ) : null}

                    <Section title={t('session.activity.approvals')} count={props.activity.approvals.length}>
                        {props.activity.approvals.length === 0 ? (
                            <EmptySection text={t('session.activity.noApprovals')} />
                        ) : (
                            <div className="space-y-2">
                                {props.activity.approvals.map((item) => (
                                    <ApprovalRow
                                        key={item.id}
                                        api={props.api}
                                        sessionId={props.sessionId}
                                        metadata={props.metadata}
                                        item={item}
                                        disabled={props.disabled}
                                        onDone={props.onRefresh}
                                        onJump={props.onJumpToTool}
                                    />
                                ))}
                            </div>
                        )}
                    </Section>

                    <Section title={t('session.activity.active')} count={props.activity.runningTools.length + (props.backgroundTaskCount ?? 0)}>
                        {props.activity.runningTools.length === 0 && !props.backgroundTaskCount ? (
                            <EmptySection text={t('session.activity.noActive')} />
                        ) : (
                            <div className="space-y-2">
                                {(props.backgroundTaskCount ?? 0) > 0 ? (
                                    <RowButton
                                        title={t('session.activity.backgroundTasks', { n: props.backgroundTaskCount ?? 0 })}
                                        meta={t('session.activity.backgroundTasksHint')}
                                    />
                                ) : null}
                                {props.activity.runningTools.map((item) => (
                                    <ToolRow key={item.id} item={item} onJump={props.onJumpToTool} />
                                ))}
                            </div>
                        )}
                    </Section>

                    <Section title={t('session.activity.files')} count={props.activity.files.length}>
                        {props.activity.files.length === 0 ? (
                            <EmptySection text={t('session.activity.noFiles')} />
                        ) : (
                            <div className="space-y-2">
                                {props.activity.files.map((item) => (
                                    <FileRow key={item.path} item={item} onJump={props.onJumpToTool} />
                                ))}
                            </div>
                        )}
                    </Section>

                    <Section title={t('session.activity.recent')} count={props.activity.recentTools.length}>
                        {props.activity.recentTools.length === 0 ? (
                            <EmptySection text={t('session.activity.noRecent')} />
                        ) : (
                            <div className="space-y-2">
                                {props.activity.recentTools.map((item) => (
                                    <ToolRow key={item.id} item={item} onJump={props.onJumpToTool} />
                                ))}
                            </div>
                        )}
                    </Section>

                    <Section title={t('session.activity.conversation')} count={props.outlineItems.length}>
                        {props.hasMoreMessages ? (
                            <div className="mb-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={props.onLoadMore}
                                    disabled={props.isLoadingMoreMessages}
                                    aria-busy={props.isLoadingMoreMessages}
                                    className="w-full gap-1.5 text-xs"
                                >
                                    {props.isLoadingMoreMessages ? (
                                        <>
                                            <Spinner size="sm" label={null} className="text-current" />
                                            {t('misc.loading')}
                                        </>
                                    ) : (
                                        <>
                                            <span aria-hidden="true">↑</span>
                                            {t('session.outline.loadOlder')}
                                        </>
                                    )}
                                </Button>
                            </div>
                        ) : null}

                        {props.outlineItems.length === 0 ? (
                            <EmptySection text={t('session.outline.empty')} />
                        ) : (
                            <div className="space-y-2">
                                {props.outlineItems.map((item) => (
                                    <RowButton
                                        key={item.id}
                                        title={item.label}
                                        meta={t('session.outline.kind.user')}
                                        onClick={() => props.onSelectOutline(item)}
                                    />
                                ))}
                            </div>
                        )}
                    </Section>
                </div>
            </aside>
        </>
    )
}
