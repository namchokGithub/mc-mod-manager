import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
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
import { ModArtwork } from "../../components/ModArtwork";
import { ModDetail } from "../../components/ModDetail";
import { ModFilters } from "../../components/ModFilters";
import { Button } from "../../components/ui/button";
import { filterMods, type Filters } from "../../lib/mods";
import type { Mod } from "../../lib/schema";

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
  const [filters, setFilters] = useState(initialFilters);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Mod | null>(null);
  const categories = useMemo(
    () => [...new Set(data.mods.map((mod) => mod.category))].sort(),
    [data.mods],
  );
  const filtered = useMemo(
    () => filterMods(data.mods, filters),
    [data.mods, filters],
  );
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

  return (
    <>
      <section
        className="hero"
        style={
          data.modpack.heroImageUrl
            ? {
                backgroundImage: `linear-gradient(90deg, #0b1511 0%, rgba(11,21,17,.94) 38%, rgba(11,21,17,.54) 100%), url(${JSON.stringify(data.modpack.heroImageUrl)})`,
              }
            : undefined
        }
      >
        <div className="hero-decor hero-decor-one" />
        <div className="hero-decor hero-decor-two" />
        <div className="hero-grid" />
        <div className="container hero-inner">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
          >
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
        <section className="stats-grid" aria-label="Collection statistics">
          {stats.map(({ label, value, icon: Icon }) => (
            <div className="stat-card" key={label}>
              <div className="stat-icon">
                <Icon size={19} />
              </div>
              <div>
                <strong>{value.toString().padStart(2, "0")}</strong>
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
          <ModFilters
            filters={filters}
            onChange={setFilters}
            categories={categories}
            count={filtered.length}
            view={view}
            onViewChange={setView}
          />
          {filtered.length ? (
            <div
              className={`mod-collection ${view === "list" ? "mod-list" : "mod-grid"}`}
            >
              {filtered.map((mod) => (
                <motion.button
                  layout={!reduceMotion}
                  key={mod.id}
                  className="mod-card"
                  onClick={() => setSelected(mod)}
                  whileHover={reduceMotion ? undefined : { y: -3 }}
                  transition={{ duration: reduceMotion ? 0 : 0.18 }}
                >
                  <div className="mod-card-top">
                    <ModArtwork name={mod.name} imageUrl={mod.imageUrl} />
                    <span className={`status status-${mod.status}`}>
                      {mod.status}
                    </span>
                  </div>
                  <div className="mod-card-body">
                    <span className="mod-category">{mod.category}</span>
                    <h3>{mod.name}</h3>
                    <p>{mod.description || "No description yet."}</p>
                  </div>
                  <div className="mod-card-footer">
                    <span>{mod.side} side</span>
                    <span>
                      View details <ArrowRight size={15} />
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Box size={32} />
              <h3>No mods found</h3>
              <p>
                Try another search or clear a filter to see more of the
                collection.
              </p>
              <Button
                variant="secondary"
                onClick={() => setFilters(initialFilters)}
              >
                Clear filters
              </Button>
            </div>
          )}
        </section>
      </div>
      <ModDetail mod={selected} onClose={() => setSelected(null)} />
    </>
  );
}
