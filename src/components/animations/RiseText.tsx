import { motion, useReducedMotion } from "motion/react";

interface RiseTextProps {
  text: string;
  className?: string;
  trigger?: "onView" | "onHover";
  duration?: number;
  stagger?: number;
  delay?: number;
  once?: boolean;
}

const ease = [0.22, 1, 0.36, 1] as const;

export function RiseText({
  text,
  className = "",
  trigger = "onHover",
  duration = 0.6,
  stagger = 0.035,
  delay = 0,
  once = true,
}: RiseTextProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <span className={className}>{text}</span>;
  }

  const isHover = trigger === "onHover";
  const words = text.split(" ");

  let charIndex = 0;

  return (
    <motion.span
      className={`inline-block ${className}`}
      aria-label={text}
      initial={isHover ? "rest" : "hidden"}
      animate={isHover ? "rest" : undefined}
      whileHover={isHover ? "hover" : undefined}
      whileInView={isHover ? undefined : "visible"}
      viewport={isHover ? undefined : { once, amount: 0.2 }}>
      {words.map((word, wordIndex) => (
        <span
          key={wordIndex}
          className="inline-block whitespace-nowrap"
          aria-hidden="true">
          {Array.from(word).map((char, index) => {
            const currentIndex = charIndex++;

            const transitionDelay = delay + currentIndex * stagger;

            return (
              <span
                key={index}
                className="relative inline-block overflow-hidden align-bottom">
                {isHover ? (
                  <>
                    {/* Original character */}
                    <motion.span
                      className="inline-block"
                      variants={{
                        rest: {
                          y: "0%",
                          transition: {
                            duration,
                            ease,
                            delay: 0,
                          },
                        },
                        hover: {
                          y: "-110%",
                          transition: {
                            duration,
                            ease,
                            delay: transitionDelay,
                          },
                        },
                      }}>
                      {char}
                    </motion.span>

                    {/* Incoming character */}
                    <motion.span
                      className="absolute inset-0 inline-block"
                      variants={{
                        rest: {
                          y: "110%",
                          transition: {
                            duration,
                            ease,
                            delay: 0,
                          },
                        },
                        hover: {
                          y: "0%",
                          transition: {
                            duration,
                            ease,
                            delay: transitionDelay,
                          },
                        },
                      }}>
                      {char}
                    </motion.span>
                  </>
                ) : (
                  <motion.span
                    className="inline-block"
                    variants={{
                      hidden: {
                        y: "110%",
                        opacity: 0,
                      },
                      visible: {
                        y: "0%",
                        opacity: 1,
                        transition: {
                          duration,
                          ease,
                          delay: transitionDelay,
                        },
                      },
                    }}>
                    {char}
                  </motion.span>
                )}
              </span>
            );
          })}

          {wordIndex < words.length - 1 && (
            <span aria-hidden="true">{"\u00A0"}</span>
          )}
        </span>
      ))}
    </motion.span>
  );
}
