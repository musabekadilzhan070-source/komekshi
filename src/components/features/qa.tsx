'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  CheckCircle2, Clock, Maximize, Minimize, Pause, Play, PlayCircle, RotateCcw, Trash2, Upload, UserPlus, Users, Video, Volume2, VolumeX,
} from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { must, useLoad, useRealtime } from '@/lib/hooks';
import { humanError } from '@/lib/errors';
import { dateTime, durationLabel, mondayOf, todayISO, weekRange } from '@/lib/date';
import type { QaParticipation, QaVideo } from '@/lib/types';
import { Avatar, Badge, Card, EmptyState, ErrorState, LoadingBlock, ProgressBar, Spinner } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { ConfirmModal, Modal } from '@/components/ui/modal';
import { Field, Input, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { StudentMultiSelect } from './students';

const BUCKET = 'qa-videos';
const ALLOWED = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v', 'video/ogg'];

// ====================== Видео плеер ======================
export function VideoPlayer({
  src, initialPosition = 0, onProgress, onEnded, onFirstPlay,
}: {
  src: string; initialPosition?: number;
  onProgress?: (watchedDelta: number, position: number) => void;
  onEnded?: () => void; onFirstPlay?: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const lastT = useRef(0);
  const started = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fs, setFs] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => setFailed(true));
    else v.pause();
  };
  const toggleFs = async () => {
    const el = wrap.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    const v = video.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) return document.exitFullscreen();
    if (el?.requestFullscreen) return el.requestFullscreen();
    if (v?.webkitEnterFullscreen) v.webkitEnterFullscreen(); // iPhone Safari
  };
  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = Number(e.target.value);
    lastT.current = v.currentTime;
  };

  return (
    <div ref={wrap} className={clsx('group relative overflow-hidden bg-black', fs ? 'h-full w-full' : 'rounded-3xl')}>
      <video
        ref={video}
        src={src}
        playsInline
        preload="metadata"
        className={clsx('block w-full bg-black', fs ? 'h-full object-contain' : 'aspect-video')}
        onClick={toggle}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setDuration(v.duration);
          if (initialPosition > 3 && initialPosition < v.duration - 3) v.currentTime = initialPosition;
          lastT.current = v.currentTime;
        }}
        onCanPlay={() => setBuffering(false)}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => { setBuffering(false); setPlaying(true); if (!started.current) { started.current = true; onFirstPlay?.(); } }}
        onPause={() => setPlaying(false)}
        onError={() => setFailed(true)}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setTime(t);
          const d = t - lastT.current;
          if (d > 0 && d < 2.5 && !e.currentTarget.paused) onProgress?.(d, t);
          lastT.current = t;
        }}
        onSeeked={(e) => { lastT.current = e.currentTarget.currentTime; }}
        onEnded={() => { setPlaying(false); onEnded?.(); }}
        onVolumeChange={(e) => { setVolume(e.currentTarget.volume); setMuted(e.currentTarget.muted); }}
      />
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-6 text-center text-white">
          <p className="font-semibold">Видеоны ойнату мүмкін болмады</p>
          <p className="mt-1 text-sm text-white/70">Желіні тексеріп, бетті жаңартыңыз. Кейбір форматтар (.mov) барлық браузерде ойнамауы мүмкін.</p>
        </div>
      )}
      {!playing && !failed && (
        <button onClick={toggle} aria-label="Ойнату" className="absolute inset-0 m-auto flex size-16 items-center justify-center rounded-full bg-white/90 text-ink shadow-lift transition-transform hover:scale-105 sm:size-20">
          {buffering && time === 0 ? <Spinner className="size-7" /> : <Play className="ml-1 size-8 fill-current" />}
        </button>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pt-10 pb-3 text-white sm:px-4">
        <input
          type="range" min={0} max={duration || 0} step={0.1} value={time} onChange={seek} aria-label="Прогресс жолағы"
          className="h-1.5 w-full cursor-pointer accent-[#450C13]"
        />
        <div className="mt-2 flex items-center gap-2 sm:gap-3">
          <button onClick={toggle} aria-label={playing ? 'Кідірту' : 'Ойнату'} className="flex size-9 items-center justify-center rounded-full hover:bg-white/15">
            {playing ? <Pause className="size-5 fill-current" /> : <Play className="size-5 fill-current" />}
          </button>
          <button
            onClick={() => { if (video.current) video.current.muted = !video.current.muted; }}
            aria-label={muted ? 'Дыбысты қосу' : 'Дыбысты өшіру'} className="flex size-9 items-center justify-center rounded-full hover:bg-white/15"
          >
            {muted || volume === 0 ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>
          <input
            type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} aria-label="Дыбыс деңгейі"
            onChange={(e) => { const v = video.current; if (v) { v.volume = Number(e.target.value); v.muted = Number(e.target.value) === 0; } }}
            className="hidden w-24 accent-[#450C13] sm:block"
          />
          <span className="ml-1 text-xs font-semibold tabular-nums">{durationLabel(time)} / {durationLabel(duration)}</span>
          <button onClick={toggleFs} aria-label={fs ? 'Толық экраннан шығу' : 'Толық экран'} className="ml-auto flex size-9 items-center justify-center rounded-full hover:bg-white/15">
            {fs ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ====================== Оқушы ======================
interface StudentVideo extends QaVideo { curator_name: string | null }

export function StudentQa({ studentId, curatorName, focusId }: { studentId: string; curatorName?: string | null; focusId?: string | null }) {
  const { data, error, loading, reload } = useLoad(async () => {
    const sb = supabaseBrowser();
    const [a, p] = await Promise.all([
      sb.from('qa_video_assignments').select('qa_videos(*)').eq('student_id', studentId),
      sb.from('qa_participation').select('*').eq('student_id', studentId),
    ]);
    const videos = (must(a) as unknown as { qa_videos: QaVideo }[]).map((x) => x.qa_videos).filter(Boolean)
      .sort((x, y) => y.week_start.localeCompare(x.week_start) || y.created_at.localeCompare(x.created_at));
    return { videos: videos as StudentVideo[], part: must(p) as QaParticipation[] };
  }, [studentId]);
  useRealtime(['qa_video_assignments'], () => reload(true), `student_id=eq.${studentId}`);
  const [playing, setPlaying] = useState<QaVideo | null>(null);

  useEffect(() => {
    if (focusId && data) {
      const v = data.videos.find((x) => x.id === focusId);
      if (v) setPlaying(v);
    }
  }, [focusId, data]);

  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (!data!.videos.length) return <EmptyState icon={PlayCircle} title="Сұрақ-жауап видеосы әлі жоқ" text="Куратор апталық видео жүктегенде осында карточка пайда болады." />;
  const current = mondayOf(todayISO());

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {data!.videos.map((v) => {
          const p = data!.part.find((x) => x.video_id === v.id);
          const percent = v.duration_seconds ? Math.min(100, Math.round((p?.watched_seconds ?? 0) * 100 / v.duration_seconds)) : null;
          const isNew = mondayOf(v.week_start) === current;
          return (
            <Card key={v.id} className="flex flex-col overflow-hidden transition-shadow hover:shadow-lift">
              <div className="relative flex aspect-[16/8] items-end bg-brand-900 p-4 text-white">
                <div className="relative flex w-full items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold tracking-wide text-white/75 uppercase">Апталық сұрақ-жауап</p>
                    <p className="truncate text-lg font-extrabold">{v.week_label}</p>
                  </div>
                  {p?.completed_at ? <Badge tone="soft"><CheckCircle2 className="size-3" /> Қаралды</Badge> : isNew ? <Badge tone="soft">Жаңа</Badge> : null}
                </div>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <p className="font-bold text-ink">{v.title}</p>
                <p className="mt-1 text-xs text-muted">{weekRange(v.week_start)}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {curatorName && <Badge><Users className="size-3" /> {curatorName}</Badge>}
                  <Badge><Clock className="size-3" /> {durationLabel(v.duration_seconds)}</Badge>
                </div>
                {p && !p.completed_at && percent != null && (
                  <div className="mt-3 flex items-center gap-2"><ProgressBar value={percent} className="flex-1" /><span className="text-[11px] font-bold text-muted">{percent}%</span></div>
                )}
                <Button className="mt-4 w-full" onClick={() => setPlaying(v)}>
                  {p?.completed_at ? <><RotateCcw className="size-4" /> Қайта көру</> : p ? <><Play className="size-4" /> Жалғастыру</> : <><Play className="size-4 fill-current" /> Бастау</>}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
      {playing && (
        <PlayerModal video={playing} studentId={studentId} participation={data!.part.find((x) => x.video_id === playing.id) ?? null}
          onClose={() => { setPlaying(null); reload(true); }} />
      )}
    </>
  );
}

function PlayerModal({ video, studentId, participation, onClose }: { video: QaVideo; studentId: string; participation: QaParticipation | null; onClose: () => void }) {
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const part = useRef<QaParticipation | null>(participation);
  const pending = useRef(0);
  const pos = useRef(participation?.last_position ?? 0);
  const busy = useRef(false);

  useEffect(() => {
    supabaseBrowser().storage.from(BUCKET).createSignedUrl(video.storage_path, 60 * 60 * 3).then(({ data, error }) => {
      if (error) setErr(humanError(error)); else setUrl(data.signedUrl);
    });
  }, [video.storage_path]);

  const ensure = useCallback(async () => {
    if (part.current) return part.current;
    const { data, error } = await supabaseBrowser().from('qa_participation')
      .upsert({ video_id: video.id, student_id: studentId }, { onConflict: 'video_id,student_id', ignoreDuplicates: false }).select().single();
    if (error) { toast.error(humanError(error)); return null; }
    part.current = data as QaParticipation;
    return part.current;
  }, [video.id, studentId, toast]);

  const flush = useCallback(async (complete = false) => {
    if (busy.current && !complete) return;
    const p = await ensure();
    if (!p) return;
    const add = Math.round(pending.current);
    if (!add && !complete) return;
    busy.current = true;
    pending.current -= add;
    const watched = p.watched_seconds + add;
    const patch: Record<string, unknown> = { watched_seconds: watched, last_position: Math.round(pos.current) };
    if (complete) patch.completed_at = new Date().toISOString();
    const { data, error } = await supabaseBrowser().from('qa_participation').update(patch).eq('id', p.id).select().single();
    busy.current = false;
    if (!error && data) part.current = data as QaParticipation;
  }, [ensure]);

  useEffect(() => {
    const t = setInterval(() => flush(), 10000);
    return () => { clearInterval(t); flush(); };
  }, [flush]);

  return (
    <Modal open onClose={onClose} size="xl" title={video.title} subtitle={`${video.week_label} · ${weekRange(video.week_start)}`}>
      {err ? <ErrorState text={err} /> : !url ? <div className="flex aspect-video items-center justify-center rounded-3xl bg-black"><Spinner className="text-white" /></div> : (
        <div className="relative">
          <VideoPlayer
            src={url}
            initialPosition={participation?.completed_at ? 0 : participation?.last_position ?? 0}
            onFirstPlay={() => { ensure(); }}
            onProgress={(d, p) => { pending.current += d; pos.current = p; }}
            onEnded={async () => { await flush(true); setFinished(true); }}
          />
          {finished && (
            <div className="animate-fade-in absolute inset-0 flex flex-col items-center justify-center rounded-3xl bg-brand-900/95 p-6 text-center text-white">
              <CheckCircle2 className="mb-3 size-14 text-white/75" />
              <p className="text-2xl font-extrabold">Сұрақ-жауап аяқталды</p>
              <p className="mt-2 text-sm text-white/70">Қатысуыңыз сақталды және кураторға көрінеді.</p>
              <div className="mt-5 flex gap-2">
                <Button variant="secondary" onClick={() => setFinished(false)}><RotateCcw className="size-4" /> Қайта көру</Button>
                <Button variant="soft" onClick={onClose}>Жабу</Button>
              </div>
            </div>
          )}
        </div>
      )}
      {video.description && <p className="mt-4 text-sm leading-relaxed whitespace-pre-wrap text-muted">{video.description}</p>}
    </Modal>
  );
}

// ====================== Куратор ======================
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    el.preload = 'metadata';
    const url = URL.createObjectURL(file);
    el.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(isFinite(el.duration) ? Math.round(el.duration) : null); };
    el.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    el.src = url;
  });
}

function uploadWithProgress(signedUrl: string, file: File, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('content-type', file.type);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded * 100) / e.total));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.responseText || `HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('network'));
    xhr.send(file);
  });
}

export function UploadVideoModal({
  curatorId, students, maxMb, onClose, onDone,
}: { curatorId: string; students: { id: string; full_name: string }[]; maxMb: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const monday = mondayOf(todayISO());
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [week, setWeek] = useState(monday);
  const [label, setLabel] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pick = async (f: File | null) => {
    setErr(null);
    if (!f) return;
    if (!ALLOWED.includes(f.type)) return setErr('Тек MP4, WebM, MOV, M4V немесе OGG форматындағы видео жүктеуге болады.');
    if (f.size > maxMb * 1024 * 1024) return setErr(`Файл көлемі ${maxMb} МБ-тан аспауы керек.`);
    setFile(f);
    setDuration(await readDuration(f));
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const save = async () => {
    if (!file) return setErr('Видео файлын таңдаңыз.');
    if (!label.trim()) return setErr('Апта атауын енгізіңіз.');
    if (!title.trim()) return setErr('Видеоның тақырыбын енгізіңіз.');
    if (!ids.length) return setErr('Кемінде бір оқушыны таңдаңыз.');
    const sb = supabaseBrowser();
    const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp4';
    const path = `${curatorId}/${crypto.randomUUID()}.${ext}`;
    setProgress(0);
    try {
      const signed = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
      if (signed.error) throw signed.error;
      await uploadWithProgress(signed.data.signedUrl, file, setProgress);
      const ins = await sb.from('qa_videos').insert({
        week_label: label.trim(), week_start: week, title: title.trim(), description: desc.trim() || null,
        storage_path: path, mime_type: file.type, size_bytes: file.size, duration_seconds: duration,
      }).select().single();
      if (ins.error) { await sb.storage.from(BUCKET).remove([path]); throw ins.error; }
      const asg = await sb.from('qa_video_assignments').insert(ids.map((id) => ({ video_id: ins.data.id, student_id: id })));
      if (asg.error) throw asg.error;
      toast.success('Видео жүктелді және оқушыларға жіберілді');
      onDone();
    } catch (e) {
      setProgress(null);
      setErr(humanError(e));
    }
  };

  const uploading = progress != null;
  return (
    <Modal
      open onClose={uploading ? () => {} : onClose} size="lg" title="Сұрақ-жауап видеосын жүктеу" subtitle={`MP4, WebM, MOV · ең көбі ${maxMb} МБ`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={uploading}>Бас тарту</Button><Button onClick={save} loading={uploading}><Upload className="size-4" /> Жүктеу</Button></>}
    >
      <div className="space-y-4">
        <label className={clsx('flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-8 text-center transition-colors', file ? 'border-brand-700 bg-brand-50' : 'border-brand-200 bg-white hover:border-brand-300')}>
          <input type="file" accept={ALLOWED.join(',')} className="sr-only" disabled={uploading} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          <Video className="mb-2 size-8 text-brand-700" />
          {file ? (
            <>
              <p className="max-w-full truncate text-sm font-bold text-ink">{file.name}</p>
              <p className="text-xs text-muted">{(file.size / 1024 / 1024).toFixed(1)} МБ · {durationLabel(duration)}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-ink">Видео файлын таңдаңыз</p>
              <p className="text-xs text-muted">Басып, құрылғыдан таңдаңыз</p>
            </>
          )}
        </label>
        {uploading && (
          <div>
            <div className="mb-1 flex justify-between text-xs font-semibold text-ink"><span>Жүктелуде…</span><span>{progress}%</span></div>
            <ProgressBar value={progress} />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Апта атауы" required><Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder="Мысалы: Қараша, 3-апта" /></Field>
          <Field label="Апта" hint={weekRange(week)}><Input type="date" value={week} onChange={(e) => e.target.value && setWeek(mondayOf(e.target.value))} /></Field>
        </div>
        <Field label="Видеоның тақырыбы" required><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} /></Field>
        <Field label="Сипаттамасы"><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={2000} /></Field>
        <Field group label="Оқушылар" required><StudentMultiSelect students={students} value={ids} onChange={setIds} /></Field>
        {err && <p role="alert" className="rounded-2xl bg-bad-soft px-4 py-3 text-sm text-bad">{err}</p>}
      </div>
    </Modal>
  );
}

interface CuratorVideo extends QaVideo {
  qa_video_assignments: { student_id: string }[];
  qa_participation: QaParticipation[];
}

export function CuratorVideoList({ curatorId, students, names, maxMb }: { curatorId: string; students: { id: string; full_name: string }[]; names: Map<string, string>; maxMb: number }) {
  const toast = useToast();
  const [upload, setUpload] = useState(false);
  const [detail, setDetail] = useState<CuratorVideo | null>(null);
  const [del, setDel] = useState<CuratorVideo | null>(null);
  const [assign, setAssign] = useState<CuratorVideo | null>(null);
  const [newIds, setNewIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const { data, error, loading, reload } = useLoad(async () => {
    const res = await supabaseBrowser().from('qa_videos').select('*, qa_video_assignments(student_id), qa_participation(*)')
      .eq('curator_id', curatorId).order('week_start', { ascending: false }).order('created_at', { ascending: false });
    return must(res) as CuratorVideo[];
  }, [curatorId]);
  useRealtime(['qa_participation', 'qa_video_assignments'], () => reload(true));

  useEffect(() => {
    if (detail && data) setDetail(data.find((v) => v.id === detail.id) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const remove = async () => {
    if (!del) return;
    setBusy(true);
    const sb = supabaseBrowser();
    const { error } = await sb.from('qa_videos').delete().eq('id', del.id);
    if (!error) await sb.storage.from(BUCKET).remove([del.storage_path]);
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.success('Видео өшірілді');
    setDel(null); reload(true);
  };
  const doAssign = async () => {
    if (!assign || !newIds.length) return;
    setBusy(true);
    const { error } = await supabaseBrowser().from('qa_video_assignments').insert(newIds.map((id) => ({ video_id: assign.id, student_id: id })));
    setBusy(false);
    if (error) return toast.error(humanError(error));
    toast.success('Видео тағайындалды');
    setAssign(null); setNewIds([]); reload(true);
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setUpload(true)} disabled={!students.length}><Upload className="size-4" /> Видео жүктеу</Button>
      </div>
      {loading ? <LoadingBlock /> : error ? <ErrorState text={error} onRetry={reload} /> : !data!.length ? (
        <EmptyState icon={Video} title="Видео әлі жүктелмеген" text="Апталық сұрақ-жауап видеосын жүктеп, оқушыларға тағайындаңыз." />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {data!.map((v) => {
            const assigned = v.qa_video_assignments.length;
            const completed = v.qa_participation.filter((p) => p.completed_at).length;
            const started = v.qa_participation.length;
            return (
              <Card key={v.id} className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-900 text-white"><PlayCircle className="size-6" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-brand-700">{v.week_label} · {weekRange(v.week_start)}</p>
                    <p className="truncate font-bold text-ink">{v.title}</p>
                    <p className="text-xs text-muted">{durationLabel(v.duration_seconds)} · {(v.size_bytes / 1024 / 1024).toFixed(1)} МБ</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-mist/60 py-2"><p className="text-lg font-extrabold text-ink">{assigned}</p><p className="text-[10px] text-muted">тағайындалды</p></div>
                  <div className="rounded-2xl bg-mist/60 py-2"><p className="text-lg font-extrabold text-ink">{started}</p><p className="text-[10px] text-muted">бастады</p></div>
                  <div className="rounded-2xl bg-ok-soft py-2"><p className="text-lg font-extrabold text-ok">{completed}</p><p className="text-[10px] text-muted">аяқтады</p></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="soft" onClick={() => setDetail(v)}>Қатысу</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setAssign(v); setNewIds([]); }}><UserPlus className="size-3.5" /> Тағайындау</Button>
                  <Button size="sm" variant="danger" className="ml-auto" onClick={() => setDel(v)} aria-label="Өшіру"><Trash2 className="size-3.5" /></Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {upload && <UploadVideoModal curatorId={curatorId} students={students} maxMb={maxMb} onClose={() => setUpload(false)} onDone={() => { setUpload(false); reload(true); }} />}
      {detail && (
        <Modal open onClose={() => setDetail(null)} size="lg" title={detail.title} subtitle="Оқушылардың қатысуы">
          <div className="space-y-2">
            {detail.qa_video_assignments.map(({ student_id }) => {
              const p = detail.qa_participation.find((x) => x.student_id === student_id);
              return (
                <div key={student_id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-line">
                  <Avatar name={names.get(student_id) ?? '?'} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{names.get(student_id) ?? 'Оқушы'}</p>
                    <p className="text-[11px] text-muted">
                      {p ? <>Бастады: {dateTime(p.started_at)}{p.completed_at && <> · Аяқтады: {dateTime(p.completed_at)}</>}</> : 'Әлі ашқан жоқ'}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-muted">Қарады: {durationLabel(p?.watched_seconds ?? 0)}</span>
                  <Badge tone={p?.completed_at ? 'ok' : p ? 'warn' : 'neutral'}>{p?.completed_at ? 'Қатысты' : p ? 'Көріп жатыр' : 'Қатыспады'}</Badge>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
      <Modal open={!!assign} onClose={() => setAssign(null)} title="Видеоны тағайындау" subtitle={assign?.title}
        footer={<><Button variant="secondary" onClick={() => setAssign(null)}>Бас тарту</Button><Button loading={busy} disabled={!newIds.length} onClick={doAssign}>Тағайындау</Button></>}>
        {assign && <StudentMultiSelect students={students} value={newIds} onChange={setNewIds} disabledIds={assign.qa_video_assignments.map((a) => a.student_id)} />}
      </Modal>
      <ConfirmModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy} danger title="Видеоны өшіру"
        text="Видео файлы мен оқушылардың қатысу деректері біржола өшіріледі." confirmLabel="Өшіру" />
    </>
  );
}

/** Бір оқушының сұрақ-жауапқа қатысуы (куратор профилі үшін) */
export function StudentQaParticipation({ studentId }: { studentId: string }) {
  const { data, error, loading, reload } = useLoad(async () => {
    const sb = supabaseBrowser();
    const [a, p] = await Promise.all([
      sb.from('qa_video_assignments').select('qa_videos(*)').eq('student_id', studentId),
      sb.from('qa_participation').select('*').eq('student_id', studentId),
    ]);
    return {
      videos: (must(a) as unknown as { qa_videos: QaVideo }[]).map((x) => x.qa_videos).filter(Boolean).sort((x, y) => y.week_start.localeCompare(x.week_start)),
      part: must(p) as QaParticipation[],
    };
  }, [studentId]);
  useRealtime(['qa_participation'], () => reload(true), `student_id=eq.${studentId}`);
  if (loading) return <LoadingBlock />;
  if (error) return <ErrorState text={error} onRetry={reload} />;
  if (!data!.videos.length) return <EmptyState icon={PlayCircle} title="Бұл оқушыға видео тағайындалмаған" />;
  return (
    <div className="space-y-2">
      {data!.videos.map((v) => {
        const p = data!.part.find((x) => x.video_id === v.id);
        return (
          <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-line">
            <PlayCircle className="size-5 text-brand-700" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">{v.title}</p>
              <p className="text-[11px] text-muted">{v.week_label} · {p ? `Қарады: ${durationLabel(p.watched_seconds)} / ${durationLabel(v.duration_seconds)}` : 'Ашылмаған'}</p>
            </div>
            <Badge tone={p?.completed_at ? 'ok' : p ? 'warn' : 'neutral'}>{p?.completed_at ? 'Қатысты' : p ? 'Басталды' : 'Қатыспады'}</Badge>
          </div>
        );
      })}
    </div>
  );
}
