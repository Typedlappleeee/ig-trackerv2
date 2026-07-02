import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { Marquee } from './components/Marquee'
import { Features } from './components/Features'
import { Showcase } from './components/Showcase'
import { Testimonials } from './components/Testimonials'
import { Pricing } from './components/Pricing'
import { Faq } from './components/Faq'
import { Footer } from './components/Footer'

export default function App() {
  return (
    <div id="top" className="relative min-h-screen overflow-x-hidden bg-bg">
      {/* Aurora de fond : blobs radiaux flous, fixés derrière le contenu */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
        <div
          className="absolute -top-40 left-1/2 h-[820px] w-[820px] -translate-x-1/2 rounded-full blur-[150px] animate-aurora"
          style={{ background: 'radial-gradient(closest-side, rgba(124,58,237,0.16), transparent)' }}
        />
        <div
          className="absolute top-[22%] -left-40 h-[560px] w-[560px] rounded-full blur-[150px] animate-aurora"
          style={{ background: 'radial-gradient(closest-side, rgba(34,211,238,0.10), transparent)', animationDelay: '-7s' }}
        />
        <div
          className="absolute bottom-[4%] -right-28 h-[640px] w-[640px] rounded-full blur-[150px] animate-aurora"
          style={{ background: 'radial-gradient(closest-side, rgba(129,140,248,0.11), transparent)', animationDelay: '-12s' }}
        />
      </div>

      <Nav />
      <main>
        <Hero />
        <Marquee />
        <Features />
        <Showcase />
        <Testimonials />
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </div>
  )
}
