import { useState } from 'react'
import { Intro } from './components/Intro'
import { Textures } from './components/Textures'
import { Aurora } from './components/Aurora'
import { Nav } from './components/Nav'
import { Hero } from './components/Hero'
import { Marquee } from './components/Marquee'
import { Features } from './components/Features'
import { CloudPhones } from './components/CloudPhones'
import { HowItWorks } from './components/HowItWorks'
import { Testimonials } from './components/Testimonials'
import { Pricing } from './components/Pricing'
import { Faq } from './components/Faq'
import { Footer } from './components/Footer'
import { useScrollFx, useScrollProgress } from './hooks/useScrollFx'

export default function App() {
  const [progress, setProgress] = useState(0)
  useScrollFx()
  useScrollProgress(setProgress)

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-bg">
      <Intro />
      <Textures />
      <Aurora />
      <Nav progress={progress} />
      <main>
        <Hero />
        <Marquee />
        <Features />
        <CloudPhones />
        <HowItWorks />
        <Testimonials />
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </div>
  )
}
