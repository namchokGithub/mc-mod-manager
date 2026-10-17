import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  ArrowUp,
  Check,
  CircleAlert,
  GitFork,
  LayoutDashboard,
  LoaderCircle,
  Moon,
  PencilLine,
  Sun,
} from "lucide-react";
import { useCollection } from "./DataContext";
import { MANAGE_ENABLED, resolveRoute, type Page } from "./routes";
import { useTheme } from "./theme";
import { useToast } from "./ToastContext";
import { saveStatusLabels } from "../lib/saveStatus";
import { DRAFT_BACKUP_KEY } from "../lib/storage";
import { Preview } from "../features/preview/Preview";

// import.meta.env.DEV is inlined as false in production, so this import and the whole editor
// chunk can be dropped from the GitHub Pages build.
const Manage = import.meta.env.DEV
  ? lazy(async () => ({
      default: (await import("../features/manage/Manage")).Manage,
    }))
  : null;

function currentPage(): Page {
  const { page, redirect } = resolveRoute(window.location.hash, MANAGE_ENABLED);
  if (redirect)
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}${redirect}`,
    );
  return page;
}

export function App() {
  const [page, setPage] = useState(currentPage);
  const [showGoToTop, setShowGoToTop] = useState(false);
  const { data, saveState, saveStatus, draftIssue, externalUpdate } =
    useCollection();
  const notify = useToast();
  const [theme, toggleTheme] = useTheme();
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    const update = () => setPage(currentPage());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    document.title = data.modpack.name;
  }, [data.modpack.name]);
  useEffect(() => {
    const updateVisibility = () => setShowGoToTop(window.scrollY > 400);
    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
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
  useEffect(() => {
    if (externalUpdate)
      notify({
        kind: "info",
        title: "Draft changed in another tab",
        description:
          "Showing the latest saved version so neither tab overwrites the other.",
      });
  }, [externalUpdate, notify]);

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
              {MANAGE_ENABLED && (
                <a
                  className={page === "manage" ? "nav-link active" : "nav-link"}
                  href="#/manage"
                  aria-current={page === "manage" ? "page" : undefined}
                >
                  <PencilLine size={17} /> Manage
                </a>
              )}
            </nav>
            <div className="header-end">
              <AnimatePresence>
                {saveStatus && (
                  <motion.span
                    key="draft"
                    className={`draft-indicator ${saveStatus === "failed" ? "draft-error" : ""}`}
                    title="Status of public/data/*.json. Use Save to local JSON in Manage to write changes."
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                  >
                    {saveStatus === "failed" ? (
                      <CircleAlert size={13} aria-hidden="true" />
                    ) : saveStatus === "saved" ? (
                      <Check size={13} aria-hidden="true" />
                    ) : saveStatus === "saving" ? (
                      <LoaderCircle
                        className="spin"
                        size={13}
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="draft-dot" aria-hidden="true" />
                    )}
                    <span className="draft-label">
                      {saveStatusLabels[saveStatus]}
                    </span>
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
                <GitFork size={18} />
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
              {page === "manage" && Manage ? (
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
        <AnimatePresence>
          {showGoToTop && (
            <motion.button
              type="button"
              className="go-to-top"
              onClick={() =>
                window.scrollTo({
                  top: 0,
                  behavior: reduceMotion ? "auto" : "smooth",
                })
              }
              aria-label="Go to top"
              title="Go to top"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18 }}
            >
              <ArrowUp size={18} aria-hidden="true" />
            </motion.button>
          )}
        </AnimatePresence>
        <footer className="site-footer">
          <span>
            BLOCK/LIST <span>·</span> {data.modpack.name}
          </span>
          <span>
            © 2026 Namchok and Moo's. All rights reserved.
            <span>·</span>Built for the worlds we make.
          </span>
        </footer>
      </div>
    </MotionConfig>
  );
}
