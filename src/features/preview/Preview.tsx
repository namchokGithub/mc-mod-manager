import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Box,
  CalendarDays,
  CircleCheck,
  FlaskConical,
  FolderOpen,
  Layers3,
  MoveUpRight,
} from "lucide-react";
import { useCollection } from "../../app/DataContext";
import { MANAGE_ENABLED } from "../../app/routes";
import { CompatBadge } from "../../components/CompatBadge";
import { ModArtwork } from "../../components/ModArtwork";
import { ModDetail } from "../../components/ModDetail";
import { ModFilters } from "../../components/ModFilters";
import { formatStat } from "../../lib/countUp";
import { useCountUp } from "./useCountUp";
import { BuildPlanGuide } from "./BuildPlanGuide";
import { ContentPreview } from "./ContentPreview";
import { Pagination } from "../../components/Pagination";
import { Button } from "../../components/ui/button";
import {
  checkCompatibility,
  statusLabel,
  verificationText,
} from "../../lib/compatibility";
import { filterMods, type Filters } from "../../lib/mods";
import {
  DEFAULT_PAGE_SIZE,
  paginate,
  type PageSize,
} from "../../lib/pagination";
import { resolveHeroImageUrl } from "../../lib/heroImage";
import type { Mod } from "../../lib/schema";
import {
  matchesSideView,
  sideCounts,
  sideViewCounts,
  sideViewLabels,
  type SideView,
} from "../../lib/side";

const sideViews: SideView[] = ["players", "server", "all"];

const initialFilters: Filters = {
  query: "",
  category: "",
  status: "",
  side: "",
  sort: "az",
};

export function Preview() {
  const { data } = useCollection();
  const reduceMotion = useReducedMotion();
  const heroRef = useRef<HTMLElement | null>(null);
  const heroHasLeftViewport = useRef(false);
  const [filters, setFilters] = useState(initialFilters);
  // Presentation only: which mods a player or a server installs. Not saved anywhere.
  const [sideView, setSideView] = useState<SideView>("players");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [heroAnimationCycle, setHeroAnimationCycle] = useState(0);
  useEffect(() => {
    const hero = heroRef.current;
    if (reduceMotion || !hero) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      if (!entry.isIntersecting) {
        heroHasLeftViewport.current = true;
        return;
      }
      if (heroHasLeftViewport.current) {
        heroHasLeftViewport.current = false;
        setHeroAnimationCycle((cycle) => cycle + 1);
      }
    });

    observer.observe(hero);
    return () => observer.disconnect();
  }, [reduceMotion]);
  // Search, filters, and sort change the result set, so they start again from page 1.
  const changeFilters = (next: Filters) => {
    setFilters(next);
    setPage(1);
  };
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Mod | null>(null);
  const categories = useMemo(
    () => [...new Set(data.mods.map((mod) => mod.category))].sort(),
    [data.mods],
  );
  // Uses the saved Modrinth snapshot only; the public page makes no API calls.
  const compat = useMemo(
    () => checkCompatibility(data.mods, data.modpack),
    [data.mods, data.modpack],
  );
  // Counted over the whole collection, the same population the list draws from.
  const sides = useMemo(() => sideCounts(data.mods), [data.mods]);
  const viewCounts = sideViewCounts(sides);
  const filtered = useMemo(
    () =>
      filterMods(
        sideView === "all"
          ? data.mods
          : data.mods.filter((mod) => matchesSideView(mod, sideView)),
        filters,
      ),
    [data.mods, filters, sideView],
  );
  // Filtering and sorting happen first; paginate also clamps a page that no longer exists.
  const paged = paginate(filtered, page, pageSize);
  const goToPage = (next: number) => {
    setPage(next);
    document
      .getElementById("collection")
      ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  };
  // Layout animation gets costly for big pages, so it turns off there.
  const animateLayout = !reduceMotion && paged.items.length <= 60;
  const stats = [
    { label: "TOTAL MODS", value: data.mods.length, icon: Box },
    {
      label: "INSTALLED",
      value: data.mods.filter((mod) => mod.status === "installed").length,
      icon: CircleCheck,
    },
    {
      label: "IN TESTING",
      value: data.mods.filter((mod) => mod.status === "testing").length,
      icon: FlaskConical,
    },
    { label: "CATEGORIES", value: categories.length, icon: FolderOpen },
  ];
  const { ref: statsRef, shown: shownStats } = useCountUp<HTMLElement>(
    stats.map((stat) => stat.value),
  );

  return (
    <>
      <section
        ref={heroRef}
        className="hero"
        style={
          data.modpack.heroImageUrl
            ? {
                backgroundImage: `var(--hero-overlay), url(${JSON.stringify(resolveHeroImageUrl(data.modpack.heroImageUrl, import.meta.env.BASE_URL))})`,
              }
            : undefined
        }>
        <div
          className="hero-decor hero-decor-one"
          key={`hero-decor-one-${heroAnimationCycle}`}
        />
        <div
          className="hero-decor hero-decor-two"
          key={`hero-decor-two-${heroAnimationCycle}`}
        />
        <div className="hero-grid" />
        <div className="container hero-inner">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}>
            <div className="eyebrow">
              <span className="eyebrow-dot" /> THE MODPACK COLLECTION{" "}
              <span className="eyebrow-rule" />
            </div>
            <h1>{data.modpack.name}</h1>
            <p className="hero-description">{data.modpack.description}</p>
            <div className="hero-meta">
              <span>
                <Layers3 size={15} /> Minecraft{" "}
                {data.modpack.minecraftVersion || "—"}
              </span>
              <span>
                {data.modpack.modloader || "Modloader not specified"}
                {data.modpack.modloaderVersion
                  ? ` ${data.modpack.modloaderVersion}`
                  : ""}
              </span>
              <span>Pack v{data.modpack.version || "—"}</span>
            </div>
            <div className="hero-actions">
              <a className="button button-primary" href="#collection">
                Explore mods <ArrowRight size={17} />
              </a>
              <span className="hero-byline">
                Curated by{" "}
                <strong>{data.modpack.author || "Unknown author"}</strong>
              </span>
            </div>
          </motion.div>
        </div>
        <div className="hero-corner" aria-hidden="true">
          WORLD / 001 <MoveUpRight size={16} />
        </div>
      </section>
      <div className="container">
        <section
          ref={statsRef}
          className="stats-grid"
          aria-label="Collection statistics">
          {stats.map(({ label, value, icon: Icon }, index) => (
            <div className="stat-card" key={label}>
              <div className="stat-icon">
                <Icon size={19} />
              </div>
              <div>
                {/* Screen readers get the final value; the counting digits are visual only. */}
                <strong aria-hidden="true">
                  {formatStat(shownStats[index] ?? value)}
                </strong>
                <span className="sr-only">{value}</span>
                <span>{label}</span>
              </div>
            </div>
          ))}
        </section>
        <section id="collection" className="collection-section">
          <div className="section-heading">
            <div>
              <div className="section-kicker">DISCOVER THE COLLECTION</div>
              <h2>
                Mods in this pack<span className="heading-period">.</span>
              </h2>
              <p>
                Every addition, considered. Explore what makes this world yours.
              </p>
            </div>
            <div className="updated">
              <CalendarDays size={16} /> Updated{" "}
              {new Date(
                `${data.modpack.updatedAt}T00:00:00`,
              ).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          </div>
          <div className="side-views">
            <div
              className="side-view-toggle"
              role="group"
              aria-label="Installation side">
              {sideViews.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={sideView === option}
                  className={sideView === option ? "selected" : ""}
                  onClick={() => {
                    setSideView(option);
                    setPage(1);
                  }}>
                  {sideViewLabels[option]}{" "}
                  <span className="side-view-count">{viewCounts[option]}</span>
                </button>
              ))}
            </div>
            <p className="side-view-note">
              {sideView === "players"
                ? "Client-only and both-side mods, from each mod's listed side."
                : sideView === "server"
                  ? "Server-only and both-side mods, from each mod's listed side."
                  : `Every mod in the collection (${sides.total}).`}
            </p>
            {sideView !== "all" && sides.unknown > 0 && (
              <p className="side-view-note side-view-unknown" role="status">
                {sides.unknown} {sides.unknown === 1 ? "mod has" : "mods have"}{" "}
                an unknown installation side.{" "}
                <button
                  type="button"
                  className="filter-reset"
                  onClick={() => {
                    setSideView("all");
                    setPage(1);
                  }}>
                  View All Mods
                </button>{" "}
                to review {sides.unknown === 1 ? "it" : "them"}.
              </p>
            )}
          </div>
          <ModFilters
            filters={filters}
            onChange={changeFilters}
            categories={categories}
            count={filtered.length}
            total={viewCounts[sideView]}
            view={view}
            onViewChange={setView}
            showSide={false}
          />
          {filtered.length ? (
            <div
              className={`mod-collection ${view === "list" ? "mod-list" : "mod-grid"}`}>
              <AnimatePresence mode="popLayout">
                {paged.items.map((mod, index) => (
                  <motion.button
                    layout={animateLayout ? "position" : false}
                    key={mod.id}
                    type="button"
                    className="mod-card"
                    onClick={() => setSelected(mod)}
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{
                      opacity: 0,
                      scale: 0.97,
                      transition: { duration: 0.14 },
                    }}
                    whileHover={{ y: -3 }}
                    transition={{
                      default: { duration: 0.18, ease: "easeOut" },
                      opacity: {
                        duration: 0.24,
                        delay: Math.min(index, 8) * 0.03,
                      },
                      scale: {
                        duration: 0.24,
                        delay: Math.min(index, 8) * 0.03,
                      },
                      layout: { duration: 0.28, ease: [0.25, 1, 0.5, 1] },
                    }}>
                    <div className="mod-card-top">
                      <ModArtwork name={mod.name} imageUrl={mod.imageUrl} />
                      <span className="card-badges">
                        {/* Unknown is the default for manual entries, so only verified results earn a badge. */}
                        {compat.get(mod.id) &&
                          compat.get(mod.id)!.status !== "unknown" && (
                            <CompatBadge
                              status={compat.get(mod.id)!.status}
                              label={statusLabel(compat.get(mod.id)!)}
                              source={verificationText(compat.get(mod.id)!)}
                              compact
                            />
                          )}
                        <span className={`status status-${mod.status}`}>
                          {mod.status}
                        </span>
                      </span>
                    </div>
                    <div className="mod-card-body">
                      <span className="mod-category">{mod.category}</span>
                      <h3>{mod.name}</h3>
                      <p>{mod.description || "No description yet."}</p>
                    </div>
                    <div className="mod-card-footer">
                      <span className="mod-card-meta">
                        {mod.side} side
                        {mod.version && (
                          <span
                            className="mod-card-version"
                            title={mod.version}>
                            {" "}
                            · v{mod.version}
                          </span>
                        )}
                      </span>
                      <span className="mod-card-cta">
                        View details <ArrowRight size={15} />
                      </span>
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <motion.div
              className="empty-state"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}>
              <div className="empty-icon">
                <Box size={26} />
              </div>
              {data.mods.length ? (
                <>
                  <h3>No mods match your filters</h3>
                  <p>
                    {filters.query.trim()
                      ? `Nothing found for “${filters.query.trim()}”. Try another search or clear a filter.`
                      : "Try another combination or clear a filter to see more of the collection."}
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      // The side view is a filter too; All Mods hides nothing.
                      setSideView("all");
                      changeFilters(initialFilters);
                    }}>
                    Clear filters
                  </Button>
                </>
              ) : (
                <>
                  <h3>This pack has no mods yet</h3>
                  {MANAGE_ENABLED ? (
                    <>
                      <p>
                        Add the first mod from the Manage page to start the
                        collection.
                      </p>
                      <a className="button button-secondary" href="#/manage">
                        Open Manage <ArrowRight size={16} />
                      </a>
                    </>
                  ) : (
                    <p>
                      Check back soon. Mods will appear here once published.
                    </p>
                  )}
                </>
              )}
            </motion.div>
          )}
          {filtered.length > 0 && (
            <Pagination
              label="Mod collection pages"
              page={paged}
              pageSize={pageSize}
              onPageChange={goToPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          )}
        </section>
        <ContentPreview data={data} />
        <BuildPlanGuide
          plan={data.batches}
          mods={data.mods}
          compat={compat}
          onOpenMod={setSelected}
        />
      </div>
      <ModDetail
        mod={selected}
        compat={compat}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
