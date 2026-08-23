import LandingNav from './landing/LandingNav';
import HeroSection from './landing/HeroSection';
import StackSection from './landing/StackSection';
import DirectionsSection from './landing/DirectionsSection';
import ReliabilitySection from './landing/ReliabilitySection';
import ProductSection from './landing/ProductSection';
import QuickstartSection from './landing/QuickstartSection';
import PricingSection from './landing/PricingSection';
import CtaSection from './landing/CtaSection';

/**
 * Eight sections, in the order a reader needs them: what it does (hero), what
 * it connects to, how the two directions differ, what happens when the far end
 * is down, what the admin looks like, how to run it, what it costs, and the
 * fork between running it yourself and letting us run it.
 *
 * The page it replaced had seventeen, four of which listed the same features
 * again, each with a centred eyebrow, a centred two-line headline and a grid of
 * cards. Section headers here are left-aligned and the divider between sections
 * is the attempt rail.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main>
        <HeroSection />
        <StackSection />
        <DirectionsSection />
        <ReliabilitySection />
        <ProductSection />
        <QuickstartSection />
        <PricingSection />
        <CtaSection />
      </main>
    </div>
  );
}
