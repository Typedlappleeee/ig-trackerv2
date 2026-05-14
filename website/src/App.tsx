import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { Features } from './components/Features'
import { Showcase } from './components/Showcase'
import { Pricing } from './components/Pricing'
import { Faq } from './components/Faq'
import { Footer } from './components/Footer'

export default function App() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Background radial glows */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[900px] rounded-full opacity-30 blur-[120px] animate-glow"
             style={{ background: 'radial-gradient(closest-side, #7c3aed, transparent)' }} />
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] rounded-full opacity-20 blur-[120px] animate-glow"
             style={{ background: 'radial-gradient(closest-side, #ec4899, transparent)' }} />
      </div>

      <Nav />
      <main>
        <Hero />
        <Features />
        <Showcase />
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </div>
  )
}
