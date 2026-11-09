import ghost from "@/assets/ghost-white.png";
import scene from "@/assets/halloween-scene.webp.asset.json";

const sceneStyle = { backgroundImage: `url(${scene.url})` } as const;

export function HalloweenBackground() {
  return (
    <div className="halloween-background" aria-hidden="true">
      {/* Tela cheia no desktop; no celular as abóboras viram dois cantos maiores. */}
      <div className="halloween-scene" style={sceneStyle} />
      <div className="halloween-scene-l" style={sceneStyle} />
      <div className="halloween-scene-r" style={sceneStyle} />
      <div className="halloween-veil" />
      <img src={ghost} alt="" className="flying-ghost ghost-one" />
      <img src={ghost} alt="" className="flying-ghost ghost-two" />
      <img src={ghost} alt="" className="flying-ghost ghost-three" />
      <img src={ghost} alt="" className="flying-ghost ghost-four" />
    </div>
  );
}
