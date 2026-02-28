import React, { useEffect } from 'react';
import { ArrowRight, Camera, Clapperboard, Film, Play, Wand2 } from 'lucide-react';

interface LandingExperienceProps {
    onEnterApp: () => void;
}

const cinematicPillars = [
    {
        icon: <Clapperboard size={20} />,
        title: 'Direct Like A Studio',
        description: 'Creative Director mode builds scenes, camera moves, and visual pacing before rendering.',
    },
    {
        icon: <Camera size={20} />,
        title: 'Generate Every Shot',
        description: 'Gemini image, Veo video, Gemini TTS, and Lyria score are orchestrated in one pipeline.',
    },
    {
        icon: <Wand2 size={20} />,
        title: 'Ship In Minutes',
        description: 'No login wall for demo mode. Jump straight into the product and create a beta commercial now.',
    },
];

const productionFlow = [
    { step: '01', label: 'Prompt The Vision', detail: 'Describe your campaign, tone, audience, and format.' },
    { step: '02', label: 'AI Director Breaks It Down', detail: 'Scene direction, overlays, timing, and script are structured automatically.' },
    { step: '03', label: 'Full Stack Render', detail: 'Visuals, voiceover, music, and final output generate in one run.' },
];

export const LandingExperience: React.FC<LandingExperienceProps> = ({ onEnterApp }) => {
    useEffect(() => {
        const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
        if (!nodes.length) return;

        const revealInViewport = () => {
            nodes.forEach((node) => {
                const rect = node.getBoundingClientRect();
                if (rect.top < window.innerHeight * 0.92) {
                    node.classList.add('is-visible');
                }
            });
        };

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        observer.unobserve(entry.target);
                    }
                }
            },
            { threshold: 0.05, rootMargin: '0px 0px -5% 0px' },
        );

        nodes.forEach((node) => observer.observe(node));
        revealInViewport();
        window.addEventListener('scroll', revealInViewport, { passive: true });
        window.addEventListener('resize', revealInViewport);
        return () => {
            observer.disconnect();
            window.removeEventListener('scroll', revealInViewport);
            window.removeEventListener('resize', revealInViewport);
        };
    }, []);

    const scrollToSection = (id: string) => {
        const target = document.getElementById(id);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    return (
        <main className="landing-root">
            <section className="landing-hero">
                <div className="landing-backdrop">
                    <div className="landing-noise" />
                    <div className="landing-beam landing-beam-left" />
                    <div className="landing-beam landing-beam-right" />
                    <div className="landing-strobe" />
                    <div className="landing-glow landing-glow-a" />
                    <div className="landing-glow landing-glow-b" />
                </div>

                <header className="landing-nav">
                    <div className="landing-brand">
                        <span className="landing-brand-mark">C</span>
                        <span className="landing-brand-name">Commy</span>
                    </div>
                    <button type="button" className="landing-nav-cta" onClick={onEnterApp}>
                        Try Beta Now
                    </button>
                </header>

                <div className="landing-hero-content">
                    <div className="landing-hero-shell">
                        <div className="landing-hero-stripes" />
                        <div className="landing-hero-badge">LIVE HACKATHON BETA</div>
                        <p className="landing-kicker">LIGHTS. CAMERA. AI ACTION.</p>
                        <h1 className="landing-title">
                            Direct
                            <span className="landing-title-gradient">Cinematic Ads</span>
                            <span>At Hackathon Speed</span>
                        </h1>
                        <p className="landing-subtitle">
                            Build studio-grade commercials from a single prompt. No crew, no signup wall for demo mode, just production.
                        </p>
                        <p className="landing-subtitle-strong">No cameras. No crew. Just AI.</p>
                        <div className="landing-hero-actions">
                            <button type="button" className="landing-btn-primary" onClick={onEnterApp}>
                                Try Beta Now
                                <ArrowRight size={16} />
                            </button>
                            <button type="button" className="landing-btn-secondary" onClick={() => scrollToSection('landing-showreel')}>
                                <Play size={15} />
                                Watch Flow
                            </button>
                        </div>
                    </div>
                    <div className="landing-kino-strip" aria-hidden>
                        <div className="landing-kino-strip-track">
                            <span>Lights. Camera. AI Action.</span>
                            <span>Neobrutalist Studio Flow.</span>
                            <span>Prompt. Produce. Publish.</span>
                            <span>Lights. Camera. AI Action.</span>
                            <span>Neobrutalist Studio Flow.</span>
                            <span>Prompt. Produce. Publish.</span>
                        </div>
                    </div>
                    <p className="landing-footnote">Beta demo access starts instantly. No account creation required.</p>
                </div>
            </section>

            <div className="landing-transition-rail" aria-hidden>
                <div className="landing-transition-rail-track">
                    <span>Commy Studio</span>
                    <span>Neobrutalist Cinematic Workflow</span>
                    <span>Gemini + Veo + TTS + Lyria</span>
                    <span>Commy Studio</span>
                    <span>Neobrutalist Cinematic Workflow</span>
                    <span>Gemini + Veo + TTS + Lyria</span>
                </div>
            </div>

            <section className="landing-section landing-section-showreel" id="landing-showreel">
                <div className="landing-section-inner">
                    <div className="landing-section-shell">
                        <div className="landing-shell-tag">Take 01</div>
                        <div className="landing-shell-lights" aria-hidden>
                            <span />
                            <span />
                            <span />
                        </div>
                        <div className="landing-section-intro landing-section-intro-panel reveal-up" data-reveal>
                            <p className="landing-section-tag">
                                <Film size={14} />
                                Production Pipeline
                            </p>
                            <h2 className="landing-section-title">One Command, Full Campaign Output</h2>
                            <p className="landing-section-copy">
                                Commy coordinates concept, storyboard, clips, TTS, scoring, and final delivery in one integrated stack.
                            </p>
                        </div>

                        <div className="landing-feature-grid">
                            {cinematicPillars.map((pillar, index) => (
                                <article
                                    key={pillar.title}
                                    className="landing-feature-card reveal-up"
                                    data-reveal
                                    style={{ transitionDelay: `${index * 120}ms` }}
                                >
                                    <div className="landing-feature-icon">{pillar.icon}</div>
                                    <h3>{pillar.title}</h3>
                                    <p>{pillar.description}</p>
                                </article>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="landing-section landing-section-alt landing-section-process">
                <div className="landing-section-inner">
                    <div className="landing-section-shell">
                        <div className="landing-shell-tag">Take 02</div>
                        <div className="landing-shell-lights" aria-hidden>
                            <span />
                            <span />
                            <span />
                        </div>
                        <div className="landing-timeline">
                            {productionFlow.map((item, index) => (
                                <div
                                    key={item.step}
                                    className="landing-timeline-item reveal-up"
                                    data-reveal
                                    style={{ transitionDelay: `${index * 100}ms` }}
                                >
                                    <span className="landing-timeline-step">{item.step}</span>
                                    <div className="landing-timeline-content">
                                        <h4>{item.label}</h4>
                                        <p>{item.detail}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="landing-section landing-section-final landing-section-cta">
                <div className="landing-section-inner landing-final-shell landing-section-shell landing-section-shell-final reveal-up" data-reveal>
                    <div className="landing-shell-tag">Take 03</div>
                    <div className="landing-shell-lights" aria-hidden>
                        <span />
                        <span />
                        <span />
                    </div>
                    <h2 className="landing-final-title">Ready To Demo?</h2>
                    <p className="landing-final-copy">
                        Launch the beta studio now and generate your first cinematic ad live.
                    </p>
                    <button type="button" className="landing-btn-primary" onClick={onEnterApp}>
                        Try Beta Now
                        <ArrowRight size={16} />
                    </button>
                </div>
            </section>
        </main>
    );
};
