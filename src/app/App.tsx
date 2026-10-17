import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  ArrowUpRight,
  CircleAlert,
  LayoutDashboard,
  LoaderCircle,
  Moon,
  PencilLine,
  Sun,
} from "lucide-react";
import { useCollection } from "./DataContext";
import { useTheme } from "./theme";
import { useToast } from "./ToastContext";
import { DRAFT_BACKUP_KEY } from "../lib/storage";
import { Preview } from "../features/preview/Preview";

const Manage = lazy(async () => ({
  default: (await import("../features/manage/Manage")).Manage,
}));

function currentPage(): "preview" | "manage" {
  return window.location.hash.startsWith("#/manage") ? "manage" : "preview";
}

export function App() {
  const [page, setPage] = useState(currentPage);
  const { data, dirty, saveState, draftIssue } = useCollection();
  const notify = useToast();
  const [theme, toggleTheme] = useTheme();
  useEffect(() => {
    const update = () => setPage(currentPage());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const previousPage = useRef(page);
  useEffect(() => {
    if (previousPage.current === page) return;
    previousPage.current = page;
    window.scrollTo({ top: 0 });
  }, [page]);
  useEffect(() => {
    if (saveState === "error")
      notify({
        kind: "error",
        title: "Draft not saved",
        description:
          "This browser could not write to LocalStorage. Export your changes to keep them.",
      });
  }, [saveState, notify]);
  useEffect(() => {
    if (draftIssue)
      notify({
        kind: "error",
        title: "Saved draft could not be opened",
        description:
          draftIssue === "backed-up"
            ? `Showing the published data instead. The old draft was kept in LocalStorage under “${DRAFT_BACKUP_KEY}”.`
            : "Showing the published data instead. The old draft was left untouched in LocalStorage.",
      });
  }, [draftIssue, notify]);

  const draftLabel =
    saveState === "saving"
      ? "Saving draft…"
      : saveState === "error"
        ? "Draft not saved"
        : "Unpublished draft";

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <button
          type="button"
          className="skip-link"
          onClick={() => document.getElementById("main-content")?.focus()}
        >
          Skip to content
        </button>
        <header className="site-header">
          <div className="header-inner">
            <a className="brand" href="#/" aria-label="Go to preview">
              <span className="brand-mark">
                <img
                  src={`${import.meta.env.BASE_URL}assets/Glossy%20Minecraft%20Slime%20Mod%20Manager-128x128.png`}
                  alt=""
                  width="36"
                  height="36"
                />
              </span>
              <span>
                BLOCK<span className="brand-accent">/</span>LIST
              </span>
              <span className="brand-caption">MODPACK STUDIO</span>
            </a>
            <nav aria-label="Main navigation">
              <a
                className={page === "preview" ? "nav-link active" : "nav-link"}
                href="#/"
                aria-current={page === "preview" ? "page" : undefined}
              >
                <LayoutDashboard size={17} /> Preview
              </a>
              <a
                className={page === "manage" ? "nav-link active" : "nav-link"}
                href="#/manage"
                aria-current={page === "manage" ? "page" : undefined}
              >
                <PencilLine size={17} /> Manage
              </a>
            </nav>
            <div className="header-end">
              <AnimatePresence>
                {dirty && (
                  <motion.span
                    key="draft"
                    className={`draft-indicator draft-${saveState}`}
                    title="Edits are saved in this browser. Export JSON to publish them."
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                  >
                    {saveState === "error" ? (
                      <CircleAlert size={13} aria-hidden="true" />
                    ) : saveState === "saving" ? (
                      <LoaderCircle
                        className="spin"
                        size={13}
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="draft-dot" aria-hidden="true" />
                    )}
                    <span className="draft-label">{draftLabel}</span>
                  </motion.span>
                )}
              </AnimatePresence>
              <button
                type="button"
                className="theme-toggle"
                onClick={toggleTheme}
                aria-label={
                  theme === "dark"
                    ? "Switch to light theme"
                    : "Switch to dark theme"
                }
                title={theme === "dark" ? "Light theme" : "Dark theme"}
              >
                {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <a
                className="header-github"
                href="https://github.com/namchokGithub/mc-mod-manager"
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
              >
                <ArrowUpRight size={18} />
              </a>
            </div>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {page === "manage" ? (
                <Suspense
                  fallback={
                    <div className="state-screen state-inline" role="status">
                      <div className="loading-orb" />
                      <p>Opening the editor…</p>
                    </div>
                  }
                >
                  <Manage />
                </Suspense>
              ) : (
                <Preview />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
        <footer className="site-footer">
          <span>
            BLOCK/LIST <span>·</span> {data.modpack.name}
          </span>
          <span>Built for the worlds we make.</span>
        </footer>
      </div>
    </MotionConfig>
  );
}
