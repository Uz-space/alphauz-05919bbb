import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, Headphones, LogOut, Loader2, Trash2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { applyCustomHex, normalizeHex, readCustomHex, restoreTheme } from "@/lib/theme";
import { ColorPicker } from "@/components/color-picker";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const RewindIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 32 24"
    className={className}
    fill="currentColor"
    strokeLinejoin="round"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <path d="M15 4 L4 12 L15 20 Z" />
    <path d="M28 4 L17 12 L28 20 Z" />
  </svg>
);
const ForwardIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 32 24"
    className={className}
    fill="currentColor"
    strokeLinejoin="round"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <path d="M4 4 L15 12 L4 20 Z" />
    <path d="M17 4 L28 12 L17 20 Z" />
  </svg>
);

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "ALPHA" },
      { name: "description", content: "Your personal music player with photos and videos." },
      { property: "og:title", content: "ALPHA" },
      { property: "og:description", content: "Your personal music player with photos and videos." },
    ],
  }),
  component: Index,
});

type Track = {
  id: string;
  title: string;
  artist: string;
  audio_path: string;
  media_path: string | null;
  media_type: "image" | "video" | null;
  position: number;
  lyrics?: string | null;
};

const SIGNED_TTL = 3600;

function extFromName(name: string) {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "bin";
}

function alphaCode(position: number) {
  return `ALPHA-${String(position + 1).padStart(4, "0")}`;
}

const ALPHA_RE = /^ALPHA-\d{4}$/;

function Index() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [editTitle, setEditTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerProgress, setDrawerProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [drawerMeasured, setDrawerMeasured] = useState(false);
  const [customHex, setCustomHex] = useState("");
  

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const urlCache = useRef<Map<string, { url: string; expires: number }>>(new Map());
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const drawerContentRef = useRef<HTMLDivElement | null>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartProgress = useRef<number>(0);

  useEffect(() => {
    const el = drawerContentRef.current;
    if (!el) return;
    const update = () => {
      const height = el.getBoundingClientRect().height;
      if (height <= 0) return;
      setContentHeight(height);
      setDrawerMeasured(true);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    restoreTheme();
    setCustomHex(readCustomHex() ?? "");
  }, []);

  const track = tracks[index];

  const fmt = (s: number) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const r = Math.floor(s % 60);
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  const getSignedUrl = useCallback(async (bucket: "audio" | "media", path: string) => {
    const key = `${bucket}/${path}`;
    const cached = urlCache.current.get(key);
    if (cached && cached.expires > Date.now() + 60_000) return cached.url;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_TTL);
    if (error || !data) return null;
    urlCache.current.set(key, { url: data.signedUrl, expires: Date.now() + SIGNED_TTL * 1000 });
    return data.signedUrl;
  }, []);

  // Load library
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      if (!alive) return;
      setUserId(userData.user.id);
      const { data, error } = await supabase
        .from("tracks")
        .select("*")
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (!alive) return;
      if (!error && data) setTracks(data as Track[]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Resolve signed URLs when current track changes
  useEffect(() => {
    let alive = true;
    setAudioUrl(null);
    setMediaUrl(null);
    setCurrent(0);
    setDuration(0);
    if (!track) return;
    (async () => {
      const au = await getSignedUrl("audio", track.audio_path);
      if (!alive) return;
      setAudioUrl(au);
      if (track.media_path) {
        const mu = await getSignedUrl("media", track.media_path);
        if (!alive) return;
        setMediaUrl(mu);
      }
    })();
    return () => {
      alive = false;
    };
  }, [track?.id, track?.audio_path, track?.media_path, getSignedUrl]);

  // Load audio when url resolves
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !audioUrl) return;
    a.pause();
    a.src = audioUrl;
    a.currentTime = 0;
    setCurrent(0);
    setDuration(0);
    a.load();
    if (playing) {
      a.play().catch((error: DOMException) => {
        if (error.name !== "AbortError" && audioRef.current?.currentSrc === audioUrl) {
          setPlaying(false);
        }
      });
    }
  }, [audioUrl]);

  useEffect(() => {
    const a = audioRef.current;
    const v = videoRef.current;
    if (!a) return;
    if (playing) {
      a.play().catch((error: DOMException) => {
        if (error.name !== "AbortError" && audioRef.current?.currentSrc === audioUrl) {
          setPlaying(false);
        }
      });
      if (v) {
        if (Number.isFinite(v.duration) && v.duration > 0) {
          const expected = a.currentTime % v.duration;
          if (Math.abs(v.currentTime - expected) > 0.35) v.currentTime = expected;
        }
        const p = v.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }
    } else {
      a.pause();
      v?.pause();
    }
  }, [playing, audioUrl, mediaUrl]);


  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    setEditTitle(track?.title ?? "");
    setEditingTitle(false);
  }, [track?.id]);

  useEffect(() => {
    setDrawerProgress(drawerOpen ? 1 : 0);
  }, [drawerOpen]);

  const handleAudioUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !userId) return;
    setUploadingAudio(true);
    setUploadProgress({ done: 0, total: files.length });
    const arr = Array.from(files);
    const wasEmpty = tracks.length === 0;
    const maxPosition = tracks.reduce((max, t) => Math.max(max, t.position), -1);
    const basePosition = maxPosition + 1;
    const inserted: Track[] = [];
    for (let i = 0; i < arr.length; i++) {
      const f = arr[i];
      const ext = extFromName(f.name);
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("audio").upload(path, f, {
        contentType: f.type || "audio/mpeg",
        upsert: false,
      });
      if (upErr) {
        console.error(upErr);
        setUploadProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
        continue;
      }
      const title = alphaCode(basePosition + i);
      const { data, error } = await supabase
        .from("tracks")
        .insert({
          user_id: userId,
          title,
          artist: "Unknown artist",
          audio_path: path,
          position: basePosition + i,
        })
        .select("*")
        .single();
      if (!error && data) inserted.push(data as Track);
      setUploadProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    }
    if (inserted.length > 0) {
      setTracks((prev) => [...prev, ...inserted]);
      if (wasEmpty) setIndex(0);
    }
    setUploadingAudio(false);
    setUploadProgress(null);
  };

  const handleMediaUpload = async (file: File | null) => {
    if (!file || !track || !userId) return;
    setUploadingMedia(true);
    const ext = extFromName(file.name);
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const isVideo = file.type.startsWith("video/");
    const bucket = "media";
    // delete previous media if any
    if (track.media_path) {
      await supabase.storage.from(bucket).remove([track.media_path]);
      urlCache.current.delete(`media/${track.media_path}`);
    }
    const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
      contentType: file.type || (isVideo ? "video/mp4" : "image/jpeg"),
      upsert: false,
    });
    if (upErr) {
      console.error(upErr);
      setUploadingMedia(false);
      return;
    }
    const media_type: "image" | "video" = isVideo ? "video" : "image";
    const { error } = await supabase
      .from("tracks")
      .update({ media_path: path, media_type, updated_at: new Date().toISOString() })
      .eq("id", track.id);
    if (!error) {
      const url = await getSignedUrl(bucket, path);
      setMediaUrl(url);
      setTracks((prev) =>
        prev.map((t) => (t.id === track.id ? { ...t, media_path: path, media_type } : t)),
      );
    }
    setUploadingMedia(false);
  };

  const seekTo = (ratio: number) => {
    const a = audioRef.current;
    if (!a || !Number.isFinite(duration) || duration <= 0) return;
    const safeRatio = Math.min(1, Math.max(0, ratio));
    const nextTime = safeRatio * duration;
    a.currentTime = nextTime;
    setCurrent(nextTime);
    const v = videoRef.current;
    if (v && Number.isFinite(v.duration) && v.duration > 0) {
      v.currentTime = nextTime % v.duration;
    }
  };

  const prepareTrackChange = () => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
    setCurrent(0);
    setDuration(0);
    setAudioUrl(null);
    setMediaUrl(null);
  };

  const selectRelativeTrack = (offset: -1 | 1) => {
    if (tracks.length === 0) return;
    prepareTrackChange();
    setIndex((i) => (i + offset + tracks.length) % tracks.length);
  };
  const next = () => selectRelativeTrack(1);
  const prev = () => selectRelativeTrack(-1);

  // Track finished: play the next one, or stop everything and rewind if it was the last
  const handleEnded = () => {
    if (index < tracks.length - 1) {
      prepareTrackChange();
      setIndex(index + 1);
      setPlaying(true);
      return;
    }
    setPlaying(false);
    setCurrent(0);
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    const v = videoRef.current;
    if (v) {
      v.pause();
      v.currentTime = 0;
    }
  };


  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const deleteCurrent = async () => {
    if (!track) return;
    setConfirmOpen(false);
    const removed = track;
    const removedIndex = index;

    // Stop playback before tearing down
    setPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }

    // Compute renumbered remaining tracks (next track takes the deleted spot)
    const remaining = tracks
      .filter((t) => t.id !== removed.id)
      .sort((a, b) => a.position - b.position)
      .map((t, i) => {
        const newTitle = ALPHA_RE.test(t.title) ? alphaCode(i) : t.title;
        return { ...t, position: i, title: newTitle };
      });
    const newIndex = remaining.length > 0 ? Math.min(removedIndex, remaining.length - 1) : 0;

    // Optimistic UI update
    setTracks(remaining);
    setIndex(newIndex);
    setCurrent(0);
    setDuration(0);
    setAudioUrl(null);
    setMediaUrl(null);

    // Storage + DB cleanup
    const pathsToRemove: { bucket: "audio" | "media"; path: string }[] = [
      { bucket: "audio", path: removed.audio_path },
    ];
    if (removed.media_path) pathsToRemove.push({ bucket: "media", path: removed.media_path });

    await Promise.all(
      pathsToRemove.map(({ bucket, path }) =>
        supabase.storage
          .from(bucket)
          .remove([path])
          .then(() => {
            urlCache.current.delete(`${bucket}/${path}`);
          }),
      ),
    );
    const { error: deleteError } = await supabase.from("tracks").delete().eq("id", removed.id);
    if (deleteError) {
      console.error(deleteError);
      // Rollback on failure
      setTracks((prev) => {
        const restored = [...prev];
        restored.splice(removedIndex, 0, removed);
        return restored;
      });
      setIndex(removedIndex);
      return;
    }

    // Renumber remaining tracks so positions/titles stay sequential
    await Promise.all(
      remaining.map((t) => {
        const patch: Partial<Track> = {};
        const original = tracks.find((tr) => tr.id === t.id);
        if (original && original.position !== t.position) patch.position = t.position;
        if (original && original.title !== t.title) patch.title = t.title;
        if (Object.keys(patch).length === 0) return Promise.resolve();
        return supabase.from("tracks").update(patch).eq("id", t.id);
      }),
    );
  };

  const updateTrack = async (id: string, patch: Partial<Pick<Track, "title" | "artist">>) => {
    if (!patch.title && !patch.artist) return;
    const { error } = await supabase.from("tracks").update(patch).eq("id", id);
    if (error) {
      console.error(error);
      return;
    }
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const progress = duration > 0 ? Math.min(1, Math.max(0, current / duration)) : 0;
  const remaining = Math.max(0, duration - current);

  return (
    <div className="relative min-h-dvh w-full overflow-hidden text-foreground">
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => {
          if (!audioUrl || e.currentTarget.currentSrc !== audioUrl) return;
          const nextTime = e.currentTarget.currentTime;
          if (Number.isFinite(nextTime)) setCurrent(nextTime);
          const v = videoRef.current;
          if (v && Number.isFinite(v.duration) && v.duration > 0) {
            const expected = nextTime % v.duration;
            if (Math.abs(v.currentTime - expected) > 0.5) v.currentTime = expected;
          }
        }}
        onLoadedMetadata={(e) => {
          if (!audioUrl || e.currentTarget.currentSrc !== audioUrl) return;
          const nextDuration = e.currentTarget.duration;
          setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
          setCurrent(e.currentTarget.currentTime || 0);
        }}
        onDurationChange={(e) => {
          if (!audioUrl || e.currentTarget.currentSrc !== audioUrl) return;
          const nextDuration = e.currentTarget.duration;
          if (Number.isFinite(nextDuration)) setDuration(nextDuration);
        }}
        onEmptied={() => {
          setCurrent(0);
          setDuration(0);
        }}
        onEnded={handleEnded}
      />

      <div className="pointer-events-none absolute inset-0"></div>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md items-center justify-center px-4 py-6 lg:max-w-[1500px] lg:px-10 lg:py-10 2xl:max-w-[1800px]">
        <div className="relative w-full overflow-hidden rounded-[40px] border border-white/5 bg-card/60 p-4 pb-6 shadow-[0_12px_36px_-18px_rgba(0,0,0,0.25)] backdrop-blur-xl lg:grid lg:h-[calc(100dvh-5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-12 lg:rounded-[44px] lg:p-10 xl:gap-16 xl:p-14">
          <label
            className="group relative isolate mx-auto block w-full max-w-full cursor-pointer self-center overflow-hidden rounded-[22px] bg-secondary ring-1 ring-white/10 transform-gpu [clip-path:inset(0_round_22px)] lg:h-auto lg:max-h-full lg:max-w-[min(100%,calc(100dvh-9rem))] lg:rounded-[32px] lg:[clip-path:inset(0_round_32px)]"
            style={{ aspectRatio: "1 / 1" }}
          >
            {mediaUrl && (
              <div
                aria-hidden
                className="absolute inset-0 scale-110 bg-cover bg-center opacity-40 blur-2xl"
                style={{ backgroundImage: `url(${mediaUrl})` }}
              />
            )}

            {track?.media_type === "video" && mediaUrl ? (
              <video
                ref={videoRef}
                key={mediaUrl}
                src={mediaUrl}
                className="absolute inset-0 h-full w-full rounded-[22px] object-cover lg:rounded-[32px]"


                loop
                muted
                playsInline
                autoPlay={playing}
                disablePictureInPicture
                preload="auto"
                onLoadedData={(e) => {
                  const a = audioRef.current;
                  if (a && Number.isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0) {
                    e.currentTarget.currentTime = a.currentTime % e.currentTarget.duration;
                  }
                  if (playing) e.currentTarget.play().catch(() => {});
                }}
                onCanPlay={(e) => {
                  if (playing && e.currentTarget.paused) e.currentTarget.play().catch(() => {});
                }}
                onStalled={(e) => {
                  if (playing) e.currentTarget.play().catch(() => {});
                }}
                onWaiting={(e) => {
                  if (playing) e.currentTarget.play().catch(() => {});
                }}
              />
            ) : mediaUrl ? (
              <img
                src={mediaUrl}
                alt=""
                className="absolute inset-0 h-full w-full rounded-[22px] object-contain lg:rounded-[32px]"
              />

            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                <span className="text-[12px]">No media</span>
              </div>
            )}
            {uploadingMedia && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[22px] bg-black/60 backdrop-blur-sm">
                <Loader2 className="h-6 w-6 animate-spin text-white" />
                <span className="text-[12px] text-white/80">Uploading…</span>
              </div>
            )}
            {track && !uploadingMedia && (
              <div className="absolute right-3 top-3 rounded-full bg-black/50 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 transition">
                Change
              </div>
            )}
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              disabled={!track || uploadingMedia}
              onChange={(e) => handleMediaUpload(e.target.files?.[0] ?? null)}
            />
          </label>

          <div className="lg:flex lg:h-full lg:flex-col lg:items-center lg:justify-center lg:pb-16">
            <div className="mt-5 px-1 text-center lg:mt-0">
              <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 px-2">
                <div />
                <div className="min-w-0 text-center">
                  {editingTitle ? (
                    <Input
                      autoFocus
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => {
                        if (track) updateTrack(track.id, { title: editTitle });
                        setEditingTitle(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") {
                          setEditTitle(track?.title ?? "");
                          setEditingTitle(false);
                        }
                      }}
                      placeholder="Song title"
                      className="h-auto w-full min-w-0 border-0 bg-transparent p-0 text-center text-[24px] font-bold leading-tight shadow-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 lg:text-[38px] xl:text-[46px]"
                    />
                  ) : (
                    <span
                      className={`block truncate select-none text-[24px] font-bold leading-tight lg:text-[38px] xl:text-[46px] ${!track ? "opacity-30" : ""}`}
                    >
                      {track?.title ?? "Song title"}
                    </span>
                  )}
                </div>
                <div className="flex justify-end">
                  {track && !editingTitle && (
                    <button
                      type="button"
                      aria-label="Edit title"
                      onClick={() => setEditingTitle(true)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <p
                className={`mt-1 select-none text-center text-[16px] text-muted-foreground lg:mt-2 lg:text-[20px] ${!track ? "opacity-30" : ""}`}
              >
                {track?.artist ?? "Artist"}
              </p>
            </div>

            <div className="mt-4 flex w-full items-center gap-3 px-1 lg:mt-10 lg:max-w-md lg:gap-4">
              <span className="w-10 text-left text-[12px] tabular-nums text-muted-foreground">
                {fmt(current)}
              </span>
              <div className="relative h-5 flex-1">
                <div
                  className="pointer-events-none absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground/25"
                />
                <div
                  className="pointer-events-none absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-foreground"
                  style={{ width: `${progress * 100}%` }}
                />
                <div
                  className="pointer-events-none absolute top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow"
                  style={{ left: `${progress * 100}%` }}
                />
                <input
                  type="range"
                  min="0"
                  max="1000"
                  step="1"
                  value={Math.round(progress * 1000)}
                  disabled={!audioUrl || duration <= 0}
                  aria-label="Song position"
                  onChange={(e) => seekTo(Number(e.currentTarget.value) / 1000)}
                  className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
                />
              </div>
              <span className="w-10 text-right text-[12px] tabular-nums text-muted-foreground">
                {fmt(remaining)}
              </span>
            </div>

            <div className="mt-5 flex items-center justify-center gap-6 px-2 lg:mt-10 lg:gap-10">
              <button
                onClick={prev}
                disabled={!track}
                className="text-foreground/95 transition-transform active:scale-90 disabled:opacity-30"
              >
                <RewindIcon className="h-11 w-11" />
              </button>
              <button
                onClick={async () => {
                  if (!track || !audioUrl) return;
                  setPlaying((p) => !p);
                }}
                disabled={!track || !audioUrl}
                className="text-foreground transition-transform active:scale-90 disabled:opacity-30"
              >
                {playing ? (
                  <Pause className="h-12 w-12 fill-current" strokeWidth={0} />
                ) : (
                  <Play className="h-12 w-12 fill-current" strokeWidth={0} />
                )}
              </button>
              <button
                onClick={next}
                disabled={!track}
                className="text-foreground/95 transition-transform active:scale-90 disabled:opacity-30"
              >
                <ForwardIcon className="h-11 w-11" />
              </button>
            </div>
          </div>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent className="max-w-[320px] rounded-3xl border-white/10 bg-background/95 backdrop-blur-xl">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-center text-base">
                  {track?.title}
                </AlertDialogTitle>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-row gap-2 sm:justify-center">
                <AlertDialogCancel className="mt-0 flex-1 rounded-full border-white/15 bg-white/5">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={deleteCurrent}
                  className="flex-1 rounded-full bg-red-500/90 text-white hover:bg-red-500"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Bottom actions drawer */}
          <div className="mt-8 h-14 lg:hidden" />

          <div
            className="pointer-events-none absolute inset-0 z-20 rounded-[40px] bg-black/35 backdrop-blur-md lg:rounded-[44px]"
            style={{
              opacity: drawerProgress,
              transition: isDragging ? "none" : "opacity 0.35s ease",
            }}
          />

          <div
            ref={drawerRef}
            className="absolute bottom-2 left-2 right-2 z-30 flex flex-col items-center lg:bottom-3 lg:left-[27%] lg:right-[27%]"


            style={{
              transform: drawerMeasured
                ? `translateY(${((1 - drawerProgress) * (contentHeight + 12)).toFixed(1)}px)`
                : "translateY(calc(100% - 40px))",
              transition:
                isDragging || !drawerMeasured
                  ? "none"
                  : "transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            {/* Handle */}
            <div
              data-drawer-handle
              className="flex h-8 w-full touch-none select-none flex-col items-center justify-center"
              onTouchStart={(e) => {
                e.preventDefault();
                dragStartY.current = e.touches[0].clientY;
                dragStartProgress.current = drawerProgress;
                setIsDragging(true);
              }}
              onTouchMove={(e) => {
                if (dragStartY.current === null || contentHeight === 0) return;
                const deltaY = dragStartY.current - e.touches[0].clientY;
                const newProgress = Math.min(
                  Math.max(dragStartProgress.current + deltaY / contentHeight, 0),
                  1,
                );
                setDrawerProgress(newProgress);
              }}
              onTouchEnd={(e) => {
                if (dragStartY.current === null) return;
                const deltaY = dragStartY.current - e.changedTouches[0].clientY;
                setIsDragging(false);
                if (deltaY > 24) setDrawerOpen(true);
                else if (deltaY < -24) setDrawerOpen(false);
                else setDrawerProgress(drawerOpen ? 1 : 0);
                dragStartY.current = null;
              }}
              onTouchCancel={() => {
                setIsDragging(false);
                dragStartY.current = null;
                setDrawerProgress(drawerOpen ? 1 : 0);
              }}
              onPointerDown={(e) => {
                if (e.pointerType === "touch") return;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                dragStartY.current = e.clientY;
                dragStartProgress.current = drawerProgress;
                setIsDragging(true);
              }}
              onPointerMove={(e) => {
                if (e.pointerType === "touch") return;
                if (dragStartY.current === null || contentHeight === 0) return;
                const deltaY = dragStartY.current - e.clientY;
                setDrawerProgress(
                  Math.min(Math.max(dragStartProgress.current + deltaY / contentHeight, 0), 1),
                );
              }}
              onPointerUp={(e) => {
                if (e.pointerType === "touch") return;
                if (dragStartY.current === null) return;
                const deltaY = dragStartY.current - e.clientY;
                setIsDragging(false);
                if (deltaY > 24) setDrawerOpen(true);
                else if (deltaY < -24) setDrawerOpen(false);
                else setDrawerProgress(drawerOpen ? 1 : 0);
                dragStartY.current = null;
              }}
            >
              <div className="h-1 w-28 rounded-full bg-foreground/70" />
            </div>

            {/* Drawer content */}
            <div ref={drawerContentRef} className="w-full">
              <div className="flex flex-col gap-2 rounded-[32px] border border-white/15 bg-card/45 p-3 shadow-[0_8px_22px_-14px_rgba(0,0,0,0.22)] backdrop-blur-2xl lg:rounded-[34px] lg:p-4">

                <button
                  onClick={() => setConfirmOpen(true)}
                  disabled={!track}
                  className="flex items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-xs font-medium text-red-400/90 hover:bg-red-500/15 hover:text-red-300 disabled:opacity-30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete current
                </button>

                <label
                  className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-white/5 py-2 text-xs text-foreground/80 hover:bg-white/10 ${uploadingAudio ? "pointer-events-none opacity-70" : ""}`}

                >
                  {uploadingAudio ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {uploadProgress
                        ? `Uploading ${uploadProgress.done}/${uploadProgress.total}`
                        : "Uploading…"}
                    </>
                  ) : (
                    <>
                      <Headphones className="h-3.5 w-3.5" />
                      Upload song
                    </>
                  )}
                  <input
                    type="file"
                    accept="audio/*"
                    multiple
                    className="hidden"
                    disabled={uploadingAudio}
                    onChange={(e) => handleAudioUpload(e.target.files)}
                  />
                </label>

                <ColorPicker
                  value={normalizeHex(customHex) ?? "#1c1c1f"}
                  onChange={(hex) => {
                    setCustomHex(hex);
                    applyCustomHex(hex);
                  }}
                />

                <button
                  type="button"
                  onClick={signOut}
                  className="flex items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-xs font-medium text-foreground/90 hover:bg-white/10"
                >
                  <LogOut className="h-3.5 w-3.5" />


                  Log out
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
