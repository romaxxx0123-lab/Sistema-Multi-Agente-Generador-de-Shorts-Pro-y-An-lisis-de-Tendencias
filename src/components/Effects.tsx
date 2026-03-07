import { EffectComposer, Bloom, Vignette, ToneMapping } from '@react-three/postprocessing';

/**
 * CINEMATIC POST-PROCESSING
 * Enhances visual fidelity with Bloom, Vignette and ToneMapping.
 */
export const Effects = () => {
  return (
    <EffectComposer>
      <Bloom
        intensity={1.5}
        luminanceThreshold={0.9}
        mipmapBlur
      />
      <Vignette eskil={false} offset={0.1} darkness={1.1} />
      <ToneMapping />
    </EffectComposer>
  );
};
