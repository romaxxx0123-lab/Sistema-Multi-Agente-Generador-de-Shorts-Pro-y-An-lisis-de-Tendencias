import { useGLTF } from '@react-three/drei';
import { Suspense } from 'react';

/**
 * GENERIC MODEL LOADER
 * Handles GLB/GLTF loading with Suspense fallback.
 * Can be used for Meshy exports or other external assets.
 */
export const ModelLoader = ({
  url,
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0]
}: {
  url: string,
  scale?: number | [number, number, number],
  position?: [number, number, number],
  rotation?: [number, number, number]
}) => {
  const { scene } = useGLTF(url);

  // Ensure shadows are enabled for all children
  scene.traverse((child: any) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return (
    <primitive
      object={scene}
      scale={scale}
      position={position}
      rotation={rotation}
    />
  );
};

export const RemoteModel = ({ url, ...props }: any) => (
  <Suspense fallback={<mesh><boxGeometry /><meshStandardMaterial color="gray" wireframe /></mesh>}>
    <ModelLoader url={url} {...props} />
  </Suspense>
);
