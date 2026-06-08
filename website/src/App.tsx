import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { Features } from './components/Features'
import { Showcase } from './components/Showcase'
import { Pricing } from './components/Pricing'
import { Faq } from './components/Faq'
import { Footer } from './components/Footer'

export default function App() {
  return (
    <div id="top" className="relative min-h-screen overflow-x-hidden bg-bg">
      {/* Aurora background: large blurred radial blobs, fixed behind content */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
        <div
          className="absolute -top-40 left-1/2 h-[780px] w-[780px] -translate-x-1/2 rounded-full blur-[140px] animate-float-slow"
          style={{ background: 'radial-gradient(closest-side, rgba(124,58,237,0.14), transparent)' }}
        />
        <div
          className="absolute top-[20%] -left-32 h-[560px] w-[560px] rounded-full blur-[140px]"
          style={{ background: 'radial-gradient(closest-side, rgba(34,211,238,0.10), transparent)' }}
        />
        <div
          className="absolute bottom-[5%] -right-24 h-[620px] w-[620px] rounded-full blur-[140px]"
          style={{ background: 'radial-gradient(closest-side, rgba(79,70,229,0.10), transparent)' }}
        />
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
