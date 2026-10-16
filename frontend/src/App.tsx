import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleAlertIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AppHeader } from '@/components/AppHeader';
import { ConfirmDialog, type ConfirmRequest } from '@/components/ConfirmDialog';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Editor } from '@/components/editor/Editor';
import { IdDialog, type IdRequest } from '@/components/IdDialog';
import { MessagePanel } from '@/components/MessagePanel';
import { PlaybookDetail } from '@/components/PlaybookDetail';
import { PlaybookList, type ListState } from '@/components/PlaybookList';
import { ApiError, playbooksApi } from '@/lib/api';
import { navigate, navigationSeq, parseRoute, useNavigation } from '@/lib/route';
import { cn } from '@/lib/utils';
import { duplicateForm, formFromDetail, newPlaybookForm } from '@/model/formModel';
import { confirmParts, deleteFileConfirm, listErrorText, readOnlyMessage, WELCOME } from '@/model/listModel';
import { deleteConfirm } from '@/model/wording';
import type { Form, PlaybookDetail as Detail, PlaybookList as List } from '@/model/types';

interface Draft { form: Form; title: string; back: Record<string, string> }
/** The detail fetched for one navigation (`seq`); a response for an older one is dropped. */
type DetailState = { seq: number; status: 'loading' } | { seq: number; status: 'ok'; detail: Detail } | { seq: number; status: 'error'; message: string };

export function App() {
  const { search, seq } = useNavigation();
  const route = parseRoute(search);
  const [listState, setListState] = useState<ListState>({ status: 'loading' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [flash, setFlash] = useState<{ text: string; seq: number } | null>(null);
  const [detailState, setDetailState] = useState<DetailState | null>(null);
  const [idDialog, setIdDialog] = useState<{ open: boolean; request: IdRequest | null; n: number; onDone: (id: string) => void }>({ open: false, request: null, n: 0, onDone: () => {} });
  const [confirm, setConfirm] = useState<{ open: boolean; request: ConfirmRequest | null; n: number }>({ open: false, request: null, n: 0 });
  const detailSeq = useRef(0);

  const loadList = useCallback(async (): Promise<List | null> => {
    try {
      const list = await playbooksApi.list();
      setListState({ status: 'ok', list });
      return list;
    } catch (e) {
      setListState({ status: 'error', message: listErrorText(e as ApiError) });
      return null;
    }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  const list = listState.status === 'ok' ? listState.list : null;
  const listReady = list !== null;

  // Navigate, with a notice shown on the screen this navigation opens and cleared by the next.
  const go = (query: Record<string, string>, flashText?: string) => {
    navigate(query);
    if (flashText) setFlash({ text: flashText, seq: navigationSeq() });
  };
  const home = () => go({});
  const flashText = flash && flash.seq === seq ? flash.text : null;

  // Every navigation re-reads the selected playbook (the editor opens on a fresh detail, too).
  useEffect(() => {
    if (!listReady) return;
    if (route.draft) {
      if (!draft) navigate({}); // a reloaded draft URL: the draft lived in memory only
      return;
    }
    const id = route.selectedId;
    if (!id) return;
    const mine = ++detailSeq.current;
    setDetailState({ seq, status: 'loading' });
    playbooksApi.detail(id).then(
      (detail) => { if (mine === detailSeq.current) setDetailState({ seq, status: 'ok', detail }); },
      (e: Error) => { if (mine === detailSeq.current) setDetailState({ seq, status: 'error', message: e.message }); },
    );
    // `seq` names the navigation; route and draft are read as of it.
  }, [seq, listReady]);

  const askId = (request: IdRequest, onDone: (id: string) => void) => setIdDialog((d) => ({ open: true, request, n: d.n + 1, onDone }));
  const idDone = (id: string | null) => {
    setIdDialog((d) => ({ ...d, open: false }));
    if (id) idDialog.onDone(id);
  };

  const askDelete = (id: string, text: string) => {
    const { title, paragraphs } = confirmParts(text);
    setConfirm((c) => ({
      open: true,
      n: c.n + 1,
      request: {
        title,
        body: paragraphs.length > 0 && paragraphs.map((p, i) => <p key={i}>{p}</p>),
        confirmLabel: 'Delete',
        onConfirm: async () => {
          try {
            await playbooksApi.remove(id);
          } catch (e) {
            throw new Error(`Delete failed: ${(e as Error).message}`);
          }
          setConfirm((c) => ({ ...c, open: false }));
          await loadList();
          go({}, `Deleted ${id}.json.`);
        },
      },
    }));
  };

  const startDraft = (d: Draft) => {
    setDraft(d);
    navigate({ draft: '1' });
  };

  const onSaved = async (id: string) => {
    const fresh = await loadList();
    go(fresh?.playbooks.some((p) => p.id === id) ? { playbook: id } : {}, `Saved ${id}.json.`);
    setDraft(null);
  };

  const hasSelection = !!(route.selectedId || route.draft);
  let main: React.ReactNode;
  if (listState.status === 'loading') {
    main = <DetailSkeleton />;
  } else if (listState.status === 'error') {
    main = <MessagePanel title="Playbooks unavailable" text={listState.message} />;
  } else if (route.draft) {
    main = draft && (
      <Editor
        key={`draft:${seq}`}
        mode="draft"
        form={draft.form}
        title={draft.title}
        originalId={null}
        originalLive={0}
        list={listState.list}
        onSaved={onSaved}
        onCancel={() => { navigate(draft.back); setDraft(null); }}
      />
    );
  } else if (!route.selectedId) {
    main = <MessagePanel title={flashText || WELCOME.title} text={flashText ? null : WELCOME.text} />;
  } else if (!detailState || detailState.seq !== seq || detailState.status === 'loading') {
    main = <DetailSkeleton />;
  } else if (detailState.status === 'error') {
    main = <MessagePanel title={`Cannot open ${route.selectedId}`} text={detailState.message} onBack={home} />;
  } else {
    const detail = detailState.detail;
    if (route.edit) {
      if (!detail.editable) {
        const m = readOnlyMessage(route.selectedId, detail.source);
        main = <MessagePanel title={m.title} text={m.text} onBack={home} />;
      } else {
        main = (
          <Editor
            key={`edit:${detail.id}:${seq}`}
            mode="edit"
            form={formFromDetail(detail)}
            title={`Edit ${detail.id}`}
            originalId={detail.id}
            originalLive={detail.liveWorkers}
            list={listState.list}
            onSaved={onSaved}
            onCancel={() => navigate({ playbook: detail.id })}
          />
        );
      }
    } else {
      main = (
        <PlaybookDetail
          detail={detail}
          list={listState.list}
          flash={flashText}
          onBack={home}
          onEdit={() => navigate({ edit: detail.id })}
          onDuplicate={() => askId({ title: `Duplicate ${detail.id}`, initial: `${detail.id.split('/').pop()}-copy` }, (id) => startDraft({
            form: duplicateForm(detail, id), title: `New playbook (from ${detail.id})`, back: { playbook: detail.id },
          }))}
          onDelete={() => askDelete(detail.id, deleteConfirm(detail.id, { builtin: listState.list.takenIds.builtin.includes(detail.id), live: detail.liveWorkers }))}
        />
      );
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader />
      <main className="mx-auto grid w-full max-w-[1400px] flex-1 content-start gap-4 p-3 md:grid-cols-[290px_minmax(0,1fr)] md:gap-6 md:p-6">
        <nav aria-label="Playbooks" className={cn('min-w-0 flex-col', hasSelection ? 'hidden md:flex' : 'flex')}>
          <ErrorBoundary resetKey={listState} fallback={(e) => <ListFailure message={e.message} />}>
            <PlaybookList
              state={listState}
              selectedId={route.selectedId}
              onSelect={(id) => navigate({ playbook: id })}
              onNew={() => askId({ title: 'New playbook', initial: '' }, (id) => startDraft({ form: newPlaybookForm(id), title: 'New playbook', back: {} }))}
              onDeleteFile={(id) => askDelete(id, deleteFileConfirm(id))}
            />
          </ErrorBoundary>
        </nav>
        <div className="min-w-0">
          <ErrorBoundary
            resetKey={seq}
            fallback={(e) => <MessagePanel title={route.selectedId ? `Cannot show ${route.selectedId}` : 'Cannot show this screen'} text={e.message} onBack={home} />}
          >
            {main}
          </ErrorBoundary>
        </div>
      </main>
      {list && <IdDialog open={idDialog.open} request={idDialog.request} n={idDialog.n} takenIds={list.takenIds} onDone={idDone} />}
      <ConfirmDialog open={confirm.open} request={confirm.request} n={confirm.n} onCancel={() => setConfirm((c) => ({ ...c, open: false }))} />
    </div>
  );
}

/** The list pane's fallback when cc's list cannot be shown (a malformed answer): the rest of the page stays up. */
function ListFailure({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>Cannot show the playbook list</AlertTitle>
      <AlertDescription><p>{message}</p></AlertDescription>
    </Alert>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <span className="sr-only" role="status">Loading</span>
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

