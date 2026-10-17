import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Blocks,
  Check,
  CircleAlert,
  LayoutDashboard,
  PencilLine,
} from "lucide-react";
import { useCollection } from "./DataContext";
import { Preview } from "../features/preview/Preview";

const Manage = lazy(async () => ({
  default: (await import("../features/manage/Manage")).Manage,
}));

function currentPage(): "preview" | "manage" {
  return window.location.hash.startsWith("#/manage") ? "manage" : "preview";
}

export function App() {
  const [page, setPage] = useState(currentPage);
  const { data, dirty, saveState } = useCollection();
  useEffect(() => {
    const update = () => setPage(currentPage());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="#/" aria-label="Go to preview">
            <span className="brand-mark">
              <Blocks size={21} />
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
            >
              <LayoutDashboard size={17} /> Preview
            </a>
            <a
              className={page === "manage" ? "nav-link active" : "nav-link"}
              href="#/manage"
            >
              <PencilLine size={17} /> Manage
            </a>
          </nav>
          <div className="header-end">
            {dirty && (
              <span
                className={`draft-indicator ${saveState === "error" ? "draft-error" : ""}`}
              >
                {saveState === "error" ? (
                  <CircleAlert size={13} />
                ) : (
                  <Check size={13} />
                )}
                {saveState === "saving"
                  ? "Saving draft"
                  : saveState === "error"
                    ? "Draft not saved"
                    : "Local draft"}
              </span>
            )}
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
      <main>
        {page === "manage" ? (
          <Suspense
            fallback={
              <div className="state-screen">
                <p>Opening the editor…</p>
              </div>
            }
          >
            <Manage />
          </Suspense>
        ) : (
          <Preview />
        )}
      </main>
      <footer className="site-footer">
        <span>
          BLOCK/LIST <span>·</span> {data.modpack.name}
        </span>
        <span>Built for the worlds we make.</span>
      </footer>
    </div>
  );
}
