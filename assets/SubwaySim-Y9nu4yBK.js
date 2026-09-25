import{b as j,j as e}from"./react-Bwx2ax-9.js";import{C as je,b as we,u as J,a as ye,O as Pe}from"./react-three-B9ZbQd5B.js";import{D as K,a1 as I,a3 as Xe,u as Fe,a0 as Ye,e as Ce,Z as Re,C as te,g as V,a4 as le,a5 as ce,a6 as Te}from"./three-core-rDWkGbJH.js";import{c as Me,a as De}from"./gpuParticleRuntime-CuHbv3Oj.js";import{u as $e,a as Ee,c as Oe,P as ze,H as Ge,N as Ne}from"./ParamControls-CtAF-1qp.js";import"./three-extras-DGniBTVG.js";const F={minX:-48,maxX:48,minY:-6.2,maxY:32,minZ:-5,maxZ:5},ue={minY:-5.5,maxY:5},ie=5,ae={minimumHeight:1.25,ceilingMargin:1.5,strength:.8};function ve(t,a){const s=Math.floor(t/ie),n=Math.ceil(a/ie);return(Math.min(s,n-1)+.5)/n}function Ae(t,a,s=z.minY,n=F.maxY){const c=ve(t,a);return s+(n-s)*c}const se=-2.5,r={landingStartX:9.4,startX:11,lowerFlightEndX:19.5,upperFlightStartX:22.5,endX:32,topLandingEndX:33.6,baseY:se,landingY:3.35,riseY:12.5,z:-2.5,width:2.8,tunnelHeight:3.2,lowerStepCount:30,upperStepCount:34,nosingDepth:.035},$={x:8.65,halfDepth:.42,pedestalHalfWidth:.12,pedestalHeight:1.15,pedestalZ:[-3.7,-2.9,-2.1,-1.3]},Z=[-7,0,7],Se=["West","Central","East"],G={z:-1.4,throatY:3.6,outletY:8,streetY:10};function ke(t,a,s,n=G.streetY){const c=[{key:"intake",y:G.throatY},{key:"outlet",y:n}];return Z.map((i,h)=>{const f=Object.fromEntries(c.map(({key:l,y:d})=>{const S=[];for(let x=0;x<s;x+=1){const v=x*4,y=t[v]-i,O=t[v+1]-d,u=t[v+2]-G.z;Math.abs(y)>3.4||Math.abs(u)>3.5||S.push({offset:v,distanceSquared:y**2+O**2+u**2})}const X=S.sort((x,v)=>x.distanceSquared-v.distanceSquared).slice(0,8);let w=0,P=0,p=0;return X.forEach(({offset:x,distanceSquared:v})=>{const y=1/(v+.01);w+=a[x+1]*y,P+=a[x+3]*y,p+=y}),[l,X.length>0?{flow:w/p,temperature:60+P/p*50,count:X.length}:{flow:null,temperature:null,count:0}]}));return{id:h,label:Se[h],x:i,...f}})}function He(t,a=4){const s=t.filter(Number.isFinite);if(s.length===0)return[60,110];const n=Math.min(...s),c=Math.max(...s),i=(n+c)/2,h=Math.max(a,c-n),f=Math.max(.5,h*.1);return[Math.floor(i-h/2-f),Math.ceil(i+h/2+f)]}const z={minX:-15.5,maxX:34,minY:10,maxY:13,minZ:-4.8,maxZ:4.8},U={sidewalkRoadEdgeZ:-.55,shaftApertureSize:1.5,sidewalkThickness:.2,surfaceParticleFloorY:10.22},be=Array.from({length:18},(t,a)=>({x:-6+a*37%120/10,y:-1.75,z:-2-a*17%15/10}));function Ie(t=r.riseY){const a=r.baseY+t;return{stairHeight:t,streetY:a,streetMaxY:a+(z.maxY-z.minY),shaftOutletY:a+(G.outletY-G.streetY),surfaceParticleFloorY:a+(U.surfaceParticleFloorY-z.minY)}}function H(t=r.baseY+r.riseY){return Ie(t-r.baseY)}const k={startX:35,endX:-35,traversalSeconds:8},R={minX:Math.min(k.startX,k.endX)-8,maxX:Math.max(k.startX,k.endX)+8,bedY:-3.8,centerZ:2.5,width:5,tunnelHeight:5.4,tunnelWidth:5.8},q={trackFloorY:R.bedY+.2,stairFloorY:r.baseY,stairOuterZ:r.z-r.width/2},D={minX:R.minX,maxX:R.maxX,y:-5,minY:-6.1,maxY:-3.8,z:-4.15,radius:1.25},E={x:-8,topY:-2.6,bottomY:-5.4,z:-4.15,radius:1.5},T={fanPositions:[-6,0,6],fanZ:1.4,fanRadius:2.4,fanMinY:.8,fanMaxY:3.8,floorMoverZ:-.6,floorMoverMinY:-3,floorMoverMaxY:-1.8,clerestoryMinGap:.08},fe=45;function o(t){return Number(t).toFixed(3)}function Ve(t,a){const s=Math.max(0,a);return{leftEndZ:t-s/2,rightStartZ:t+s/2}}function me(t,a,s,n=0){const c=4+Math.tan(a*Math.PI/180)*2.3;if(t<=s){const h=de((t+4.6)/(s+4.6));return 4+(c-4)*h}const i=de((t-s)/(4.6-s));return c+n+(4-c)*i}function Q(t,a,s,n,c=Z,i=G.z,h=1.5){if(i<=s||i>=n)return[{startX:t,endX:a,startZ:s,endZ:n}];const f=h/2,l=Math.max(s,i-f),d=Math.min(n,i+f),S=[{startX:t,endX:a,startZ:s,endZ:l},{startX:t,endX:a,startZ:d,endZ:n}],X=[...c].sort((P,p)=>P-p);let w=t;return X.forEach(P=>{const p=Math.max(t,P-f),x=Math.min(a,P+f);p>w&&S.push({startX:w,endX:p,startZ:l,endZ:d}),w=Math.max(w,x)}),w<a&&S.push({startX:w,endX:a,startZ:l,endZ:d}),S.filter(P=>P.endX>P.startX&&P.endZ>P.startZ)}function Le(t){const a=[{key:"shaftExchange",label:"Shaft exchange",points:t.shaftExchange*32,description:"Passive lift through the three street shafts."},{key:"grooves",label:"Passive grooves",points:t.grooves*18,description:"Low-energy guidance along the roof grooves."},{key:"floodFlow",label:"Flood gallery",points:t.floodTunnels?t.floodFlow*22:0,description:"Cold-sink exchange through the lower gallery."}],s=[{key:"shaftFans",label:"Shaft fans",points:t.shaftFans?t.shaftFanVelocity/8*12:0,description:"Powered upward flow through the street shafts."},{key:"downFans",label:"Downward fans",points:t.downFans*8,description:"Powered ceiling fan transport."},{key:"floorAirMovers",label:"Floor air movers",points:t.floorAirMovers*8,description:"Powered platform-level transport."},{key:"ceilingFans",label:"Ceiling flow",points:t.ceilingFans*10,description:"Powered ceiling-band sweep."}],n=a.reduce((h,f)=>h+f.points,0),c=s.reduce((h,f)=>h+f.points,0),i=fe+n-c;return{baseline:fe,passive:a,active:s,passiveTotal:n,activeTotal:c,rawScore:i,score:Math.round(Math.max(0,Math.min(100,i)))}}function Be(t,a=r.baseY,s=r.landingY,n=r.baseY+r.riseY){if(t<=r.startX)return a;if(t<r.lowerFlightEndX){const c=(t-r.startX)/(r.lowerFlightEndX-r.startX);return a+c*(s-a)}if(t<=r.upperFlightStartX)return s;if(t<r.endX){const c=(t-r.upperFlightStartX)/(r.endX-r.upperFlightStartX);return s+c*(n-s)}return n}function Ze(t=r.landingY,a=r.baseY+r.riseY,s=r.tunnelHeight){const n=r.endX-r.upperFlightStartX,c=a-t,i=Math.atan2(c,n),h=(r.upperFlightStartX+r.endX)/2,f=t+c/2+s/2,l=s/2,S=(a-U.sidewalkThickness/2-f-l*Math.cos(i))/Math.sin(i);return h+S*Math.cos(i)-l*Math.sin(i)}function We(t,a){return a<=0?!1:a>=1?!0:(t*.61803398875%1+1)%1<a}function Ue(t,a,s,n=0,c=0){if(!s)return{active:!1,positionX:k.startX,velocityX:0};const i=Math.max(k.traversalSeconds+c,a),h=(t%i+i)%i,f=Math.floor(Math.max(0,t)/i),l=We(f,n),d=k.traversalSeconds/2,S=l?c:0;if(h>k.traversalSeconds+S)return{active:!1,positionX:k.startX,velocityX:0};const X=k.endX-k.startX,w=X/k.traversalSeconds;if(l&&h>=d&&h<=d+S)return{active:!0,positionX:0,velocityX:0,stopped:!0};const P=l&&h>d?h-S:h;return{active:!0,positionX:k.startX+X*(P/k.traversalSeconds),velocityX:w,stopped:!1}}function de(t){return Math.max(0,Math.min(1,t))}const b={surfaceTemperature:81.5,roadSurfaceTemperature:92,ambientAirTemperature:72,passengerHeat:.75,surfaceCrosswind:3,stairUndergroundOpeningHeight:r.tunnelHeight,stairLandingHeight:r.landingY,stairSurfaceOpeningHeight:r.baseY+r.riseY,density:1.18,stiffness:5,viscosity:.012,train:!0,ac:!0,brakes:!0,shaftExchange:.65,shaftControls:[1,1,1],shaftFans:!0,shaftFanVelocity:2.5,downFans:.45,floorAirMovers:.5,ceilingFans:.5,grooves:.7,floodTunnels:!0,floodFlow:.55,floodPumpDirection:1,roofPitch:14,roofOffset:0,roofGapHorizontal:0,roofGapVertical:0,clerestoryWindows:!0,clerestoryOpen:0,stackEffect:.65,trainInterval:20,trainStopFrequency:.5,trainStopDuration:6,particleCount:4096,particleDiameter:.7,particleMagnitudeScale:.6,windOcclusion:!0},re=[(R.minX+R.maxX)/2,3,0],ne=[{id:"front",label:"Front",position:[0,3,-72]},{id:"back",label:"Back",position:[0,3,72]},{id:"left",label:"Left",position:[-61,3,0]},{id:"right",label:"Right",position:[61,3,0]},{id:"ortho1",label:"Ortho 1",position:[41,38,48]},{id:"ortho2",label:"Ortho 2",position:[-41,38,-48]},{id:"orbital",label:"Orbital tracking",position:null}],oe={breakpoint:700,width:306,right:28};function he(t,a,s,n,c){if(!c||n.width<=oe.breakpoint)return new V;const h=(oe.width+oe.right)/2,l=2*a.distanceTo(s)*Math.tan(I.degToRad(t.fov)/2)*n.width/n.height;return s.clone().sub(a).normalize().cross(new V(0,1,0)).normalize().multiplyScalar(h*l/n.width)}const _e=be.map(t=>`passengerInfluence = max(passengerInfluence, (1.0 - smoothstep(0.25, 1.6, length(particlePosition.xz - vec2(${o(t.x)}, ${o(t.z)})))) * (1.0 - smoothstep(0.4, 1.9, abs(particlePosition.y - ${o(t.y)}))));`).join(`
    `),qe=`
  uniform float uDt;
  uniform float uRoofPitch;
  uniform float uRoofOffset;
  uniform float uRoofGapHorizontal;
  uniform float uRoofGapVertical;
  uniform float uStairTunnelHeight;
  uniform float uStairLandingY;
  uniform float uStairSurfaceY;
  uniform float uStreetY;
  uniform float uSurfaceFloorY;
  uniform float uClerestoryOpen;
  uniform bool uClerestoryWindows;
  uniform bool uFloodTunnels;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 positionData = texture2D(uPositionTex, uv);
    vec4 velocityData = texture2D(uVelocityTex, uv);
    positionData.xyz += velocityData.xyz * uDt;
    if (positionData.y >= uStreetY && positionData.w < 1.5) {
      float surfaceIdentity = fract(sin(dot(positionData.xz, vec2(12.9898, 78.233))) * 43758.5453);
      positionData.w = 2.0 + surfaceIdentity * 0.999;
    }

    if (positionData.w > 1.5) {
      positionData.x = mod(
        positionData.x - ${o(F.minX)},
        ${o(F.maxX-F.minX)}
      ) + ${o(F.minX)};
    } else {
      if (positionData.x < ${o(F.minX)}) positionData.x += ${o(F.maxX-F.minX)};
      if (positionData.x > ${o(F.maxX)}) positionData.x -= ${o(F.maxX-F.minX)};
    }
    positionData.y = clamp(positionData.y, ${o(F.minY)}, ${o(F.maxY)});
    if (positionData.y >= uStreetY) {
      positionData.z = mod(
        positionData.z - ${o(F.minZ)},
        ${o(F.maxZ-F.minZ)}
      ) + ${o(F.minZ)};
    } else {
      positionData.z = clamp(positionData.z, ${o(F.minZ)}, ${o(F.maxZ)});
    }
    if (!uFloodTunnels) positionData.y = max(positionData.y, ${o(D.maxY)});

    float trackGroundContact = step(${o(R.minX)}, positionData.x)
      * step(positionData.x, ${o(R.maxX)})
      * step(abs(positionData.z - ${o(R.centerZ)}), ${o(R.tunnelWidth/2)});
    if (trackGroundContact > 0.5) positionData.y = max(positionData.y, ${o(q.trackFloorY)});

    float stairX = positionData.x;
    float lowerStairProgress = clamp((stairX - ${o(r.startX)}) / ${o(r.lowerFlightEndX-r.startX)}, 0.0, 1.0);
    float upperStairProgress = clamp((stairX - ${o(r.upperFlightStartX)}) / ${o(r.endX-r.upperFlightStartX)}, 0.0, 1.0);
    float stairSurfaceY = stairX < ${o(r.lowerFlightEndX)}
      ? mix(${o(r.baseY)}, uStairLandingY, lowerStairProgress)
      : (stairX <= ${o(r.upperFlightStartX)} ? uStairLandingY : mix(uStairLandingY, uStairSurfaceY, upperStairProgress));
    float stairZone = step(${o(r.landingStartX)}, stairX) * step(stairX, ${o(r.endX)});
    float stairDistance = abs(positionData.z - ${o(r.z)});
    float stairFoundationContact = stairZone * step(stairDistance, ${o(r.width/2)});
    if (stairFoundationContact > 0.5) positionData.y = max(positionData.y, ${o(q.stairFloorY)});
    float stairOuterGroundContact = stairZone
      * step(${o(r.baseY)}, positionData.y)
      * step(positionData.y, stairSurfaceY + uStairTunnelHeight)
      * step(${o(F.minZ)}, positionData.z)
      * step(positionData.z, ${o(q.stairOuterZ)});
    if (stairOuterGroundContact > 0.5) positionData.z = ${o(q.stairOuterZ+.02)};
    float stairContact = stairZone * (1.0 - smoothstep(0.0, 1.7, stairDistance));
    float thermalContact = smoothstep(0.05, 0.4, velocityData.w) * stairContact;
    if (thermalContact > 0.0 && positionData.y < stairSurfaceY + 0.12) {
      positionData.y = mix(positionData.y, stairSurfaceY + 0.12, thermalContact);
    }
    float stairUnderfillContact = step(${o(r.startX)}, stairX)
      * step(stairX, ${o(r.endX)})
      * step(stairDistance, ${o(r.width/2)});
    if (stairUnderfillContact > 0.5) positionData.y = max(positionData.y, stairSurfaceY + 0.12);

    float turnstileXContact = step(abs(positionData.x - ${o($.x)}), ${o($.halfDepth)});
    float turnstileYContact = step(${o(r.baseY)}, positionData.y)
      * step(positionData.y, ${o(r.baseY+$.pedestalHeight)});
    float turnstilePedestalContact = max(
      max(
        step(abs(positionData.z - ${o($.pedestalZ[0])}), ${o($.pedestalHalfWidth)}),
        step(abs(positionData.z - ${o($.pedestalZ[1])}), ${o($.pedestalHalfWidth)})
      ),
      max(
        step(abs(positionData.z - ${o($.pedestalZ[2])}), ${o($.pedestalHalfWidth)}),
        step(abs(positionData.z - ${o($.pedestalZ[3])}), ${o($.pedestalHalfWidth)})
      )
    );
    if (turnstileXContact * turnstileYContact * turnstilePedestalContact > 0.5) {
      positionData.x = ${o($.x)} + (velocityData.x >= 0.0 ? -${o($.halfDepth)} : ${o($.halfDepth)});
    }

    float roofRidgeY = 4.0 + tan(uRoofPitch) * 2.3;
    float roofCeiling = positionData.z <= uRoofOffset
      ? mix(4.0, roofRidgeY, clamp((positionData.z + 4.6) / (uRoofOffset + 4.6), 0.0, 1.0))
      : uRoofGapVertical + mix(roofRidgeY, 4.0, clamp((positionData.z - uRoofOffset) / (4.6 - uRoofOffset), 0.0, 1.0));
    float clerestoryHalfGap = max(${o(T.clerestoryMinGap)}, uRoofGapHorizontal * 0.5);
    float clerestoryOpening = (uClerestoryWindows ? 1.0 : 0.0) * uClerestoryOpen * uRoofGapVertical
      * (1.0 - smoothstep(clerestoryHalfGap, clerestoryHalfGap + 0.35, abs(positionData.z - uRoofOffset)));
    float shaftNorth = 1.0 - smoothstep(0.0, 1.25, abs(positionData.x + 7.0));
    float shaftCenter = 1.0 - smoothstep(0.0, 1.25, abs(positionData.x));
    float shaftSouth = 1.0 - smoothstep(0.0, 1.25, abs(positionData.x - 7.0));
    float shaftOpening = max(shaftNorth, max(shaftCenter, shaftSouth))
      * (1.0 - smoothstep(0.0, 1.1, abs(positionData.z - ${o(G.z)})))
      * smoothstep(0.4, ${o(G.throatY)}, positionData.y);
    float stairTunnelCeiling = stairSurfaceY + uStairTunnelHeight;
    float stairPassage = stairZone
      * (1.0 - smoothstep(0.0, ${o(r.width/2)}, stairDistance))
      * step(positionData.y, stairTunnelCeiling);
    float stairExit = step(${o(r.endX-1.4)}, stairX)
      * (1.0 - smoothstep(0.0, ${o(r.width/2)}, stairDistance))
      * step(stairX, ${o(r.topLandingEndX)})
      * step(stairSurfaceY, positionData.y);
    float surfaceOpening = max(step(0.05, shaftOpening), stairExit);
    if (positionData.w > 1.5 && surfaceOpening < 0.5) positionData.y = max(positionData.y, uSurfaceFloorY);
    if (stairPassage > 0.5) positionData.y = min(positionData.y, max(roofCeiling, stairTunnelCeiling));
    if (positionData.w < 1.5 && shaftOpening < 0.05 && stairExit < 0.5 && clerestoryOpening < 0.05) positionData.y = min(positionData.y, roofCeiling);

    gl_FragColor = positionData;
  }
`,Ke=`
  uniform float uDt;
  uniform float uSurfaceTemperature;
  uniform float uRoadSurfaceTemperature;
  uniform float uAmbientAirTemperature;
  uniform float uPassengerHeat;
  uniform float uSurfaceCrosswind;
  uniform float uRadius;
  uniform float uRestDensity;
  uniform float uStiffness;
  uniform float uViscosity;
  uniform float uTrainPosX;
  uniform float uTrainVelX;
  uniform float uShaftExchange;
  uniform vec3 uShaftControls;
  uniform float uShaftFanVelocity;
  uniform float uDownFans;
  uniform float uFloorAirMovers;
  uniform float uCeilingFans;
  uniform float uGrooves;
  uniform float uFloodFlow;
  uniform float uFloodPumpDirection;
  uniform float uRoofPitch;
  uniform float uRoofOffset;
  uniform float uRoofGapHorizontal;
  uniform float uRoofGapVertical;
  uniform float uClerestoryOpen;
  uniform float uStackEffect;
  uniform float uStairTunnelHeight;
  uniform float uStairLandingY;
  uniform float uStairSurfaceY;
  uniform float uStreetY;
  uniform float uStreetMaxY;
  uniform float uSurfaceFloorY;
  uniform float uShaftOutletY;
  uniform bool uTrainActive;
  uniform bool uShaftFans;
  uniform bool uClerestoryWindows;
  uniform bool uWindOcclusion;
  uniform bool uAcActive;
  uniform bool uBrakesActive;
  uniform bool uFloodTunnels;

  #define PI 3.141592653589793

  float cubicSplineKernel(float q) {
    float sigma = 8.0 / (PI * pow(uRadius, 3.0));
    if (q >= 0.0 && q <= 0.5) return sigma * (6.0 * (pow(q, 3.0) - pow(q, 2.0)) + 1.0);
    if (q > 0.5 && q <= 1.0) return sigma * (2.0 * pow(1.0 - q, 3.0));
    return 0.0;
  }

  vec3 simulationOffset(vec4 positionData, vec4 neighborData) {
    vec3 offset = positionData.xyz - neighborData.xyz;
    if (positionData.w > 1.5 && neighborData.w > 1.5) {
      float surfaceSpan = ${o(F.maxZ-F.minZ)};
      offset.z -= surfaceSpan * floor(offset.z / surfaceSpan + 0.5);
    }
    return offset;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 positionData = texture2D(uPositionTex, uv);
    vec4 velocityData = texture2D(uVelocityTex, uv);
    vec3 particlePosition = positionData.xyz;
    vec3 particleVelocity = velocityData.xyz;
    float thermalIntensity = velocityData.w;
    float surfaceParticle = step(1.5, positionData.w);
    float density = 0.0;
    vec3 pressureForce = vec3(0.0);
    vec3 viscosityForce = vec3(0.0);

    for (float y = 0.0; y < resolution.y; y += 2.0) {
      for (float x = 0.0; x < resolution.x; x += 2.0) {
        vec2 neighborUv = vec2(x + 0.5, y + 0.5) / resolution.xy;
        vec4 neighborData = texture2D(uPositionTex, neighborUv);
        vec3 offset = simulationOffset(positionData, neighborData);
        float distanceToNeighbor = length(offset);

        if (distanceToNeighbor > 0.0001 && distanceToNeighbor < uRadius) {
          float kernelPosition = distanceToNeighbor / uRadius;
          density += cubicSplineKernel(kernelPosition);
        }
      }
    }

    float pressure = max(0.0, uStiffness * (density - uRestDensity));
    for (float y = 0.0; y < resolution.y; y += 2.0) {
      for (float x = 0.0; x < resolution.x; x += 2.0) {
        vec2 neighborUv = vec2(x + 0.5, y + 0.5) / resolution.xy;
        vec4 neighborData = texture2D(uPositionTex, neighborUv);
        vec3 neighborVelocity = texture2D(uVelocityTex, neighborUv).xyz;
        vec3 offset = simulationOffset(positionData, neighborData);
        float distanceToNeighbor = length(offset);

        if (distanceToNeighbor > 0.0001 && distanceToNeighbor < uRadius) {
          float kernelPosition = distanceToNeighbor / uRadius;
          float kernelWeight = cubicSplineKernel(kernelPosition);
          pressureForce += normalize(offset) * pressure * (1.0 - kernelPosition);
          viscosityForce += uViscosity * (neighborVelocity - particleVelocity) * kernelWeight;
        }
      }
    }

    vec3 acceleration = pressureForce + viscosityForce + vec3(0.6 * (1.0 - surfaceParticle), 0.0, 0.0);
    float surfaceHeat = clamp((uSurfaceTemperature - 60.0) / 50.0, 0.0, 1.0);
    float surfaceBand = 1.0 - smoothstep(0.0, 2.1, abs(particlePosition.y + 2.4));
    float surfaceThermalDelta = surfaceHeat - 0.42;
    acceleration.y += surfaceThermalDelta * surfaceBand * 0.55;
    thermalIntensity = clamp(thermalIntensity + uDt * surfaceThermalDelta * surfaceBand * 0.25, 0.0, 1.0);
    float passengerInfluence = 0.0;
    ${_e}
    if (surfaceParticle < 0.5) {
      acceleration.y += passengerInfluence * uPassengerHeat * 0.8;
      thermalIntensity = clamp(thermalIntensity + uDt * passengerInfluence * uPassengerHeat * 0.18, 0.0, 1.0);
    }
    float roadBand = surfaceParticle
      * step(uStreetY, particlePosition.y)
      * (1.0 - smoothstep(0.0, 2.4, particlePosition.y - uStreetY))
      * step(${o(z.minX)}, particlePosition.x)
      * step(particlePosition.x, ${o(z.maxX)})
      * step(${o(U.sidewalkRoadEdgeZ)}, particlePosition.z)
      * step(particlePosition.z, ${o(z.maxZ)});
    float roadThermalDelta = clamp((uRoadSurfaceTemperature - uAmbientAirTemperature) / 40.0, -1.0, 1.0);
    acceleration.y += roadThermalDelta * roadBand * 1.15;
    thermalIntensity = clamp(thermalIntensity + uDt * roadThermalDelta * roadBand * 0.35, 0.0, 1.0);
    float ambientBand = surfaceParticle * smoothstep(uStreetY + 0.8, uStreetY + 2.4, particlePosition.y);
    float ambientHeat = clamp((uAmbientAirTemperature - 60.0) / 50.0, 0.0, 1.0);
    acceleration.y += (ambientHeat - 0.42) * ambientBand * 0.1;
    thermalIntensity += (ambientHeat - thermalIntensity) * uDt * ambientBand * 0.12;
    float surfaceWindBand = smoothstep(uStreetY - 0.5, uStreetY + 0.5, particlePosition.y);
    float surfaceMixFraction = fract(positionData.w);
    float surfaceMixTargetY = mix(
      uSurfaceFloorY + ${o(ae.minimumHeight)},
      ${o(F.maxY-ae.ceilingMargin)},
      surfaceMixFraction
    );
    float surfaceShaftNorth = 1.0 - smoothstep(0.55, 1.4, abs(particlePosition.x + 7.0));
    float surfaceShaftCenter = 1.0 - smoothstep(0.55, 1.4, abs(particlePosition.x));
    float surfaceShaftSouth = 1.0 - smoothstep(0.55, 1.4, abs(particlePosition.x - 7.0));
    float surfaceShaftOutlet = max(surfaceShaftNorth, max(surfaceShaftCenter, surfaceShaftSouth))
      * (1.0 - smoothstep(0.45, 1.25, abs(particlePosition.z - ${o(G.z)})))
      * smoothstep(uShaftOutletY, uShaftOutletY + 0.4, particlePosition.y)
      * (1.0 - smoothstep(uStreetMaxY - 0.4, uStreetMaxY, particlePosition.y));
    float surfaceShaftControl = surfaceShaftSouth > surfaceShaftCenter && surfaceShaftSouth > surfaceShaftNorth
      ? uShaftControls.z
      : (surfaceShaftNorth > surfaceShaftCenter ? uShaftControls.x : uShaftControls.y);
    float surfaceShaftControlMagnitude = abs(surfaceShaftControl);
    float surfaceFloorReturn = surfaceWindBand * (
      1.0 - smoothstep(
        uSurfaceFloorY,
        uSurfaceFloorY + 0.9,
        particlePosition.y
      )
    );
    float surfaceCeilingReturn = smoothstep(${o(F.maxY-1.5)}, ${o(F.maxY-.2)}, particlePosition.y);
    acceleration.y += surfaceFloorReturn * (0.9 + max(0.0, -particleVelocity.y) * 6.0);
    acceleration.y += abs(uSurfaceCrosswind) * surfaceShaftOutlet * surfaceShaftControl * 1.8;
    acceleration.y += surfaceParticle * abs(uSurfaceCrosswind)
      * (surfaceMixTargetY - particlePosition.y) * ${o(ae.strength)} * surfaceWindBand
      * (1.0 - surfaceShaftOutlet * surfaceShaftControlMagnitude);
    acceleration.y -= surfaceCeilingReturn * (4.0 + max(0.0, particleVelocity.y) * 6.0);
    acceleration.z += (uSurfaceCrosswind - particleVelocity.z) * surfaceWindBand * 1.2 * (1.0 - surfaceShaftOutlet * surfaceShaftControlMagnitude * 0.82);

    float stairX = particlePosition.x;
    float lowerStairProgress = clamp((stairX - ${o(r.startX)}) / ${o(r.lowerFlightEndX-r.startX)}, 0.0, 1.0);
    float upperStairProgress = clamp((stairX - ${o(r.upperFlightStartX)}) / ${o(r.endX-r.upperFlightStartX)}, 0.0, 1.0);
    float stairSurfaceY = stairX < ${o(r.lowerFlightEndX)}
      ? mix(${o(r.baseY)}, uStairLandingY, lowerStairProgress)
      : (stairX <= ${o(r.upperFlightStartX)} ? uStairLandingY : mix(uStairLandingY, uStairSurfaceY, upperStairProgress));
    float stairProgress = clamp((stairX - ${o(r.startX)}) / ${o(r.endX-r.startX)}, 0.0, 1.0);
    float stairZone = step(${o(r.landingStartX)}, stairX) * step(stairX, ${o(r.endX)});
    float stairProximity = stairZone
      * (1.0 - smoothstep(0.0, 1.7, abs(particlePosition.z - ${o(r.z)})))
      * (1.0 - smoothstep(0.0, 1.8, abs(particlePosition.y - stairSurfaceY)));
    float stairApproach = smoothstep(${o(r.landingStartX-1.5)}, ${o(r.landingStartX)}, stairX)
      * (1.0 - smoothstep(${o(r.endX-1.5)}, ${o(r.endX)}, stairX));
    float stairSlope = stairX < ${o(r.lowerFlightEndX)}
      ? (uStairLandingY - ${o(r.baseY)}) / ${o(r.lowerFlightEndX-r.startX)}
      : (stairX <= ${o(r.upperFlightStartX)}
        ? 0.0
        : (uStairSurfaceY - uStairLandingY) / ${o(r.endX-r.upperFlightStartX)});
    vec3 stairDirection = normalize(vec3(1.0, stairSlope, 0.0));
    acceleration += stairDirection * stairProximity * (0.45 + thermalIntensity * 2.4);
    acceleration += stairDirection * stairProximity * abs(uSurfaceCrosswind) * (0.12 + stairProgress * 0.28);
    acceleration.z += (${o(r.z)} - particlePosition.z) * stairApproach * thermalIntensity * 0.35;
    float stairExit = smoothstep(${o(r.endX-2.4)}, ${o(r.endX)}, stairX)
      * (1.0 - smoothstep(0.0, ${o(r.width/2)}, abs(particlePosition.z - ${o(r.z)})))
      * smoothstep(stairSurfaceY - 0.2, stairSurfaceY + 1.0, particlePosition.y);
    acceleration.y += stairExit * (1.4 + uStackEffect * 2.8) * (0.3 + thermalIntensity * 2.2);
    acceleration.x += stairExit * (1.0 - stairX) * thermalIntensity * 0.12;
    acceleration.y += thermalIntensity * 0.22;

    float shaftNorth = 1.0 - smoothstep(0.0, 1.8, abs(particlePosition.x + 7.0));
    float shaftCenter = 1.0 - smoothstep(0.0, 1.8, abs(particlePosition.x));
    float shaftSouth = 1.0 - smoothstep(0.0, 1.8, abs(particlePosition.x - 7.0));
    float shaftInfluence = max(shaftNorth, max(shaftCenter, shaftSouth));
    float shaftCaptureHeight = 1.0 - smoothstep(
      uStreetY,
      uStreetY + 0.6,
      particlePosition.y
    );
    float ceilingBand = smoothstep(1.8, 4.0, particlePosition.y);
    float shaftHorizontalCapture = shaftInfluence
      * (1.0 - smoothstep(0.0, 1.3, abs(particlePosition.z - ${o(G.z)})))
      * smoothstep(0.4, 2.5, particlePosition.y)
      * shaftCaptureHeight;
    float shaftVerticalColumn = shaftInfluence
      * (1.0 - smoothstep(0.0, 0.9, abs(particlePosition.z - ${o(G.z)})))
      * smoothstep(0.4, ${o(G.throatY)}, particlePosition.y)
      * shaftCaptureHeight;
    float shaftTargetX = shaftSouth > shaftCenter && shaftSouth > shaftNorth ? 7.0 : (shaftNorth > shaftCenter ? -7.0 : 0.0);
    float shaftControl = shaftSouth > shaftCenter && shaftSouth > shaftNorth
      ? uShaftControls.z
      : (shaftNorth > shaftCenter ? uShaftControls.x : uShaftControls.y);
    float shaftControlMagnitude = abs(shaftControl);
    shaftHorizontalCapture *= shaftControlMagnitude;
    shaftVerticalColumn *= shaftControlMagnitude;
    float floodBand = 1.0 - smoothstep(0.0, 2.4, abs(particlePosition.z + 4.15));
    float fanBand = max(
      (1.0 - smoothstep(${o(T.fanRadius*.6)}, ${o(T.fanRadius)}, abs(particlePosition.x + 6.0))),
      max(
        (1.0 - smoothstep(${o(T.fanRadius*.6)}, ${o(T.fanRadius)}, abs(particlePosition.x))),
        (1.0 - smoothstep(${o(T.fanRadius*.6)}, ${o(T.fanRadius)}, abs(particlePosition.x - 6.0)))
      )
    )
      * (1.0 - smoothstep(1.4, 2.3, abs(particlePosition.z - ${o(T.fanZ)})))
      * smoothstep(${o(T.fanMinY)}, ${o(T.fanMinY+.4)}, particlePosition.y)
      * (1.0 - smoothstep(${o(T.fanMaxY-.4)}, ${o(T.fanMaxY)}, particlePosition.y));
    float floodCaptureBand = 1.0 - smoothstep(0.0, 1.6, abs(particlePosition.y + 3.1));
    float floodGalleryBand = (1.0 - smoothstep(0.0, ${o(D.radius)}, abs(particlePosition.z - ${o(D.z)})))
      * (1.0 - smoothstep(${o(D.minY)}, ${o(D.maxY)}, particlePosition.y));
    float floorMoverInfluence = max(
      (1.0 - smoothstep(${o(T.fanRadius*.6)}, ${o(T.fanRadius)}, abs(particlePosition.x + 6.0))),
      max(
        (1.0 - smoothstep(${o(T.fanRadius*.6)}, ${o(T.fanRadius)}, abs(particlePosition.x))),
        (1.0 - smoothstep(${o(T.fanRadius*.6)}, ${o(T.fanRadius)}, abs(particlePosition.x - 6.0)))
      )
    )
      * (1.0 - smoothstep(1.0, 1.8, abs(particlePosition.z - ${o(T.floorMoverZ)})))
      * smoothstep(${o(T.floorMoverMinY)}, ${o(T.floorMoverMinY+.4)}, particlePosition.y)
      * (1.0 - smoothstep(${o(T.floorMoverMaxY-.4)}, ${o(T.floorMoverMaxY)}, particlePosition.y));

    if (particlePosition.y > 0.4) {
      acceleration.x += (shaftTargetX - particlePosition.x)
        * shaftHorizontalCapture * uShaftExchange * 0.9;
      float poweredShaftLift = uShaftFans ? uShaftFanVelocity : 0.0;
      float crosswindDraw = abs(uSurfaceCrosswind) * 0.3;
      acceleration.x += (shaftTargetX - particlePosition.x) * shaftVerticalColumn * 3.6;
      acceleration.y += shaftVerticalColumn * sign(shaftControl) * (uShaftExchange * 2.4 + uStackEffect * 3.4 + poweredShaftLift + crosswindDraw) * (0.35 + thermalIntensity * 1.8);
      acceleration.z += (${o(G.z)} - particlePosition.z) * shaftVerticalColumn * 4.4;
      acceleration.y -= fanBand * uDownFans * 1.8;
      acceleration.x += ceilingBand * uCeilingFans * 1.4 * (1.0 - shaftVerticalColumn);
      acceleration.x += ceilingBand * uGrooves * 0.5 * (1.0 - shaftVerticalColumn);
      thermalIntensity = max(0.0, thermalIntensity - uDt * shaftVerticalColumn * (uShaftExchange * 0.2 + uStackEffect * 0.35));
      thermalIntensity = max(0.0, thermalIntensity - uDt * ceilingBand * (uDownFans + uCeilingFans) * 0.08);
    }
    acceleration.x += floorMoverInfluence * uFloorAirMovers * 2.0;
    float roofRidgeY = 4.0 + tan(uRoofPitch) * 2.3;
    float roofCeiling = particlePosition.z <= uRoofOffset
      ? mix(4.0, roofRidgeY, clamp((particlePosition.z + 4.6) / (uRoofOffset + 4.6), 0.0, 1.0))
      : uRoofGapVertical + mix(roofRidgeY, 4.0, clamp((particlePosition.z - uRoofOffset) / (4.6 - uRoofOffset), 0.0, 1.0));
    float distanceBelowRoof = roofCeiling - particlePosition.y;
    float roofFollowBand = 1.0 - smoothstep(0.15, 1.35, abs(distanceBelowRoof - 0.25));
    float roofSlope = abs(tan(uRoofPitch));
    float roofAvailable = 1.0 - shaftVerticalColumn;
    acceleration.y += ((distanceBelowRoof - 0.25) * 3.2 + roofSlope * uGrooves * 0.9) * roofFollowBand * roofAvailable;
    acceleration.z += -sign(particlePosition.z - uRoofOffset) * uGrooves * roofFollowBand * roofAvailable * 1.4;
    if (particlePosition.y > roofCeiling - 0.18) {
      acceleration.y -= (particlePosition.y - roofCeiling + 0.18) * 1.8;
      acceleration.x += sign(particlePosition.z) * uGrooves * 0.22;
    }
    float clerestoryWidth = max(${o(T.clerestoryMinGap)}, uRoofGapHorizontal * 0.5);
    float clerestoryHeight = max(0.05, uRoofGapVertical);
    float clerestoryBand = (1.0 - smoothstep(0.0, clerestoryWidth, abs(particlePosition.z - uRoofOffset)))
      * smoothstep(roofCeiling - clerestoryHeight, roofCeiling + 0.9, particlePosition.y);
    if (uClerestoryWindows && uClerestoryOpen > 0.0 && clerestoryBand > 0.0) {
      acceleration.y += clerestoryBand * uClerestoryOpen * (0.8 + uStackEffect * 2.2) * (0.35 + thermalIntensity * 1.7);
      thermalIntensity = max(0.0, thermalIntensity - uDt * clerestoryBand * uClerestoryOpen * 0.25);
    }
    if (uFloodTunnels) {
      float waterfallRadial = length(vec2(particlePosition.x - ${o(E.x)}, particlePosition.z - ${o(E.z)}));
      float waterfallBand = (1.0 - smoothstep(${o(E.radius*.5)}, ${o(E.radius)}, waterfallRadial))
        * smoothstep(${o(E.bottomY)}, ${o(E.bottomY+.4)}, particlePosition.y)
        * (1.0 - smoothstep(${o(E.topY-.4)}, ${o(E.topY)}, particlePosition.y));
      acceleration.y -= uFloodFlow * floodBand * floodCaptureBand * 0.8;
      acceleration.y -= uFloodFlow * waterfallBand * 2.4;
      acceleration.z += (${o(D.z)} - particlePosition.z) * uFloodFlow * floodCaptureBand * 0.45;
      acceleration.x += uFloodPumpDirection * uFloodFlow * floodGalleryBand * 2.4;
      thermalIntensity = max(0.0, thermalIntensity - uDt * uFloodFlow * (floodBand * floodCaptureBand * 0.22 + floodGalleryBand * 0.35 + waterfallBand * 0.8));
    }

    if (surfaceParticle < 0.5 && uAcActive && abs(particlePosition.x - uTrainPosX) < 5.0 && particlePosition.y > 1.0 && particlePosition.z > 0.5) {
      thermalIntensity = min(1.0, thermalIntensity + uDt * 0.45);
      acceleration += vec3(0.0, 4.5, 0.0);
    }
    if (surfaceParticle < 0.5 && uBrakesActive && abs(particlePosition.x - uTrainPosX) < 8.0 && particlePosition.y < -2.0 && abs(particlePosition.z - 2.5) < 1.0) {
      thermalIntensity = min(1.0, thermalIntensity + uDt * 0.6);
      acceleration += vec3((fract(sin(particlePosition.x * 12.0) * 43758.5) - 0.5) * 3.0, 2.0, 0.0);
    }
    if (surfaceParticle < 0.5 && uTrainActive && abs(uTrainVelX) > 0.5) {
      acceleration += vec3(uTrainVelX * 0.4, 0.0, 0.0);
      thermalIntensity *= (1.0 - uDt * 0.2);
    }

    if (uWindOcclusion) {
      float columnX = particlePosition.x < -6.0 ? -8.0 : (particlePosition.x < -2.0 ? -4.0 : (particlePosition.x < 2.0 ? 0.0 : 4.0));
      vec2 columnOffset = vec2(particlePosition.x - columnX, particlePosition.z + 0.6);
      float columnDistance = length(columnOffset);
      float columnHeightBand = smoothstep(-3.0, -2.6, particlePosition.y) * (1.0 - smoothstep(3.6, 4.0, particlePosition.y));
      float columnOcclusion = (1.0 - smoothstep(0.25, 1.1, columnDistance)) * columnHeightBand;
      acceleration.xz += normalize(columnOffset + vec2(0.0001)) * columnOcclusion * 2.4;
      float platformOcclusion = smoothstep(-4.0, -3.6, particlePosition.y) * (1.0 - smoothstep(-2.85, -2.45, particlePosition.y))
        * (1.0 - smoothstep(0.3, 1.2, abs(particlePosition.z + 0.6)));
      acceleration.z += platformOcclusion * 1.6;
      if (uTrainActive) {
        vec3 trainOffset = particlePosition - vec3(uTrainPosX, -1.8, 2.5);
        float trainOcclusion = (1.0 - smoothstep(0.0, 1.0, max(abs(trainOffset.x) - 8.0, max(abs(trainOffset.y) - 1.7, abs(trainOffset.z) - 1.4))));
        acceleration.yz += normalize(trainOffset.yz + vec2(0.0001)) * trainOcclusion * 2.8;
      }
    }

    thermalIntensity = max(0.0, thermalIntensity - uDt * 0.015);
    particleVelocity += acceleration * uDt;
    particleVelocity *= 0.985;
    gl_FragColor = vec4(particleVelocity, thermalIntensity);
  }
`,Je=`
  uniform sampler2D uPositionTex;
  uniform sampler2D uVelocityTex;
  uniform float uParticleDiameter;
  uniform float uParticleMagnitudeScale;
  attribute vec2 aSimulationUv;
  varying float vThermal;

  void main() {
    vec4 positionData = texture2D(uPositionTex, aSimulationUv);
    vec4 velocityData = texture2D(uVelocityTex, aSimulationUv);
    vThermal = velocityData.w;
    float velocityMagnitude = clamp(length(velocityData.xyz) * 0.12, 0.0, 1.0);
    float diameterScale = 1.0 + vThermal * 0.5 + velocityMagnitude * uParticleMagnitudeScale;
    vec3 worldPosition = positionData.xyz + position * uParticleDiameter * diameterScale;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(worldPosition, 1.0);
  }
`,Qe=`
  uniform vec3 uCoolColor;
  uniform vec3 uWarmColor;
  uniform vec3 uHotColor;
  varying float vThermal;

  void main() {
    vec3 color = vThermal < 0.5
      ? mix(uCoolColor, uWarmColor, vThermal * 2.0)
      : mix(uWarmColor, uHotColor, (vThermal - 0.5) * 2.0);
    gl_FragColor = vec4(color, 0.76);
  }
`;function et({settings:t,trainRef:a,onTelemetry:s,onGpuError:n}){const{gl:c}=ye(),i=j.useRef(null),h=j.useRef(null),f=j.useRef(null),l=j.useRef(t),d=j.useRef(s),S=j.useRef(0),X=j.useRef({position:null,velocity:null}),w=j.useRef(81.5);l.current=t,d.current=s;const P=t.particleCount,p=Math.ceil(Math.sqrt(P)),x=j.useMemo(()=>{const y=new Fe(.5,10,8);return y.setAttribute("aSimulationUv",new Ye(Me(p,P),2)),y},[P,p]),v=j.useMemo(()=>new Ce({uniforms:{uPositionTex:{value:null},uVelocityTex:{value:null},uParticleDiameter:{value:b.particleDiameter},uParticleMagnitudeScale:{value:b.particleMagnitudeScale},uCoolColor:{value:new te("#3a9bb4")},uWarmColor:{value:new te("#f0a23a")},uHotColor:{value:new te("#f45b4f")}},vertexShader:Je,fragmentShader:Qe,transparent:!0,depthWrite:!1,blending:Re}),[P]);return j.useEffect(()=>{let y;try{const O=H(l.current.stairSurfaceOpeningHeight),u=De({gl:c,resolution:p,positionShader:qe,velocityShader:Ke,initialize:({particleIndex:g,positionData:N,velocityData:M,offset:A})=>{const _=g%ie===0;N[A]=I.lerp(F.minX,F.maxX,Math.random()),N[A+1]=_?Ae(g,P,O.streetY):I.lerp(ue.minY,ue.maxY,Math.random()),N[A+2]=I.lerp(F.minZ,F.maxZ,Math.random()),N[A+3]=_?2+ve(g,P)*.999:1,M[A]=0,M[A+1]=0,M[A+2]=0,M[A+3]=0}});y=u.gpuCompute;const{positionVariable:Y,velocityVariable:m}=u;Y.material.uniforms.uDt={value:.016},Y.material.uniforms.uRoofPitch={value:I.degToRad(b.roofPitch)},Y.material.uniforms.uRoofOffset={value:b.roofOffset},Y.material.uniforms.uRoofGapHorizontal={value:b.roofGapHorizontal},Y.material.uniforms.uRoofGapVertical={value:b.roofGapVertical},Y.material.uniforms.uStairTunnelHeight={value:b.stairUndergroundOpeningHeight},Y.material.uniforms.uStairLandingY={value:b.stairLandingHeight},Y.material.uniforms.uStairSurfaceY={value:b.stairSurfaceOpeningHeight},Y.material.uniforms.uStreetY={value:H(b.stairSurfaceOpeningHeight).streetY},Y.material.uniforms.uSurfaceFloorY={value:H(b.stairSurfaceOpeningHeight).surfaceParticleFloorY},Y.material.uniforms.uClerestoryOpen={value:b.clerestoryOpen},Y.material.uniforms.uClerestoryWindows={value:b.clerestoryWindows},Y.material.uniforms.uFloodTunnels={value:b.floodTunnels},m.material.uniforms.uDt={value:.016},m.material.uniforms.uSurfaceTemperature={value:b.surfaceTemperature},m.material.uniforms.uRoadSurfaceTemperature={value:b.roadSurfaceTemperature},m.material.uniforms.uAmbientAirTemperature={value:b.ambientAirTemperature},m.material.uniforms.uPassengerHeat={value:b.passengerHeat},m.material.uniforms.uSurfaceCrosswind={value:b.surfaceCrosswind},m.material.uniforms.uRadius={value:.85},m.material.uniforms.uRestDensity={value:b.density},m.material.uniforms.uStiffness={value:b.stiffness},m.material.uniforms.uViscosity={value:b.viscosity},m.material.uniforms.uTrainPosX={value:0},m.material.uniforms.uTrainVelX={value:0},m.material.uniforms.uShaftExchange={value:b.shaftExchange},m.material.uniforms.uShaftControls={value:new V(...b.shaftControls)},m.material.uniforms.uShaftFanVelocity={value:b.shaftFanVelocity},m.material.uniforms.uDownFans={value:b.downFans},m.material.uniforms.uFloorAirMovers={value:b.floorAirMovers},m.material.uniforms.uCeilingFans={value:b.ceilingFans},m.material.uniforms.uGrooves={value:b.grooves},m.material.uniforms.uFloodFlow={value:b.floodFlow},m.material.uniforms.uFloodPumpDirection={value:b.floodPumpDirection},m.material.uniforms.uRoofPitch={value:I.degToRad(b.roofPitch)},m.material.uniforms.uRoofOffset={value:b.roofOffset},m.material.uniforms.uRoofGapHorizontal={value:b.roofGapHorizontal},m.material.uniforms.uRoofGapVertical={value:b.roofGapVertical},m.material.uniforms.uClerestoryOpen={value:b.clerestoryOpen},m.material.uniforms.uClerestoryWindows={value:b.clerestoryWindows},m.material.uniforms.uStackEffect={value:b.stackEffect},m.material.uniforms.uStairTunnelHeight={value:b.stairUndergroundOpeningHeight},m.material.uniforms.uStairLandingY={value:b.stairLandingHeight},m.material.uniforms.uStairSurfaceY={value:b.stairSurfaceOpeningHeight},m.material.uniforms.uStreetY={value:H(b.stairSurfaceOpeningHeight).streetY},m.material.uniforms.uStreetMaxY={value:H(b.stairSurfaceOpeningHeight).streetMaxY},m.material.uniforms.uSurfaceFloorY={value:H(b.stairSurfaceOpeningHeight).surfaceParticleFloorY},m.material.uniforms.uShaftOutletY={value:H(b.stairSurfaceOpeningHeight).shaftOutletY},m.material.uniforms.uTrainActive={value:!0},m.material.uniforms.uShaftFans={value:b.shaftFans},m.material.uniforms.uAcActive={value:!0},m.material.uniforms.uBrakesActive={value:!0},m.material.uniforms.uFloodTunnels={value:!0},m.material.uniforms.uWindOcclusion={value:b.windOcclusion};const L=y.init();if(L)throw new Error(L);i.current=y,h.current=Y,f.current=m}catch(O){n(O instanceof Error?O.message:"GPU simulation could not initialize.")}return()=>{i.current=null,h.current=null,f.current=null,y?.dispose(),x.dispose(),v.dispose()}},[c,n,x,v]),J((y,O)=>{const u=i.current,Y=h.current,m=f.current;if(!u||!Y||!m)return;const L=Math.min(O,.033),g=l.current,N=H(g.stairSurfaceOpeningHeight),M=Ue(y.clock.elapsedTime,g.trainInterval,g.train,g.trainStopFrequency,g.trainStopDuration);a.current&&(a.current.position.x=M.positionX,a.current.visible=M.active),Y.material.uniforms.uDt.value=L,Y.material.uniforms.uRoofPitch.value=I.degToRad(g.roofPitch),Y.material.uniforms.uRoofOffset.value=g.roofOffset,Y.material.uniforms.uRoofGapHorizontal.value=g.roofGapHorizontal,Y.material.uniforms.uRoofGapVertical.value=g.roofGapVertical,Y.material.uniforms.uStairTunnelHeight.value=g.stairUndergroundOpeningHeight,Y.material.uniforms.uStairLandingY.value=g.stairLandingHeight,Y.material.uniforms.uStairSurfaceY.value=g.stairSurfaceOpeningHeight,Y.material.uniforms.uStreetY.value=N.streetY,Y.material.uniforms.uSurfaceFloorY.value=N.surfaceParticleFloorY,Y.material.uniforms.uClerestoryOpen.value=g.clerestoryOpen,Y.material.uniforms.uClerestoryWindows.value=g.clerestoryWindows,Y.material.uniforms.uFloodTunnels.value=g.floodTunnels,m.material.uniforms.uDt.value=L,m.material.uniforms.uSurfaceTemperature.value=g.surfaceTemperature,m.material.uniforms.uRoadSurfaceTemperature.value=g.roadSurfaceTemperature,m.material.uniforms.uAmbientAirTemperature.value=g.ambientAirTemperature,m.material.uniforms.uPassengerHeat.value=g.passengerHeat,m.material.uniforms.uSurfaceCrosswind.value=g.surfaceCrosswind,m.material.uniforms.uRestDensity.value=g.density,m.material.uniforms.uStiffness.value=g.stiffness,m.material.uniforms.uViscosity.value=g.viscosity,m.material.uniforms.uTrainPosX.value=M.positionX,m.material.uniforms.uTrainVelX.value=M.velocityX,m.material.uniforms.uShaftExchange.value=g.shaftExchange,m.material.uniforms.uShaftControls.value.fromArray(g.shaftControls),m.material.uniforms.uShaftFanVelocity.value=g.shaftFanVelocity,m.material.uniforms.uDownFans.value=g.downFans,m.material.uniforms.uFloorAirMovers.value=g.floorAirMovers,m.material.uniforms.uCeilingFans.value=g.ceilingFans,m.material.uniforms.uGrooves.value=g.grooves,m.material.uniforms.uFloodFlow.value=g.floodFlow,m.material.uniforms.uFloodPumpDirection.value=g.floodPumpDirection,m.material.uniforms.uRoofPitch.value=I.degToRad(g.roofPitch),m.material.uniforms.uRoofOffset.value=g.roofOffset,m.material.uniforms.uRoofGapHorizontal.value=g.roofGapHorizontal,m.material.uniforms.uRoofGapVertical.value=g.roofGapVertical,m.material.uniforms.uClerestoryOpen.value=g.clerestoryOpen,m.material.uniforms.uClerestoryWindows.value=g.clerestoryWindows,m.material.uniforms.uStackEffect.value=g.stackEffect,m.material.uniforms.uStairTunnelHeight.value=g.stairUndergroundOpeningHeight,m.material.uniforms.uStairLandingY.value=g.stairLandingHeight,m.material.uniforms.uStairSurfaceY.value=g.stairSurfaceOpeningHeight,m.material.uniforms.uStreetY.value=N.streetY,m.material.uniforms.uStreetMaxY.value=N.streetMaxY,m.material.uniforms.uSurfaceFloorY.value=N.surfaceParticleFloorY,m.material.uniforms.uShaftOutletY.value=N.shaftOutletY,m.material.uniforms.uTrainActive.value=M.active,m.material.uniforms.uShaftFans.value=g.shaftFans,m.material.uniforms.uAcActive.value=g.ac&&M.active,m.material.uniforms.uBrakesActive.value=g.brakes&&M.active,m.material.uniforms.uFloodTunnels.value=g.floodTunnels,m.material.uniforms.uWindOcclusion.value=g.windOcclusion,u.compute();const A=u.getCurrentRenderTarget(Y),_=u.getCurrentRenderTarget(m);if(v.uniforms.uPositionTex.value=A.texture,v.uniforms.uVelocityTex.value=_.texture,v.uniforms.uParticleDiameter.value=g.particleDiameter,v.uniforms.uParticleMagnitudeScale.value=g.particleMagnitudeScale,S.current+=L,S.current>.4){let W=g.ambientAirTemperature;W+=(g.roadSurfaceTemperature-g.ambientAirTemperature)*.22,W+=g.passengerHeat*1.4,g.ac&&(W+=4.5),g.brakes&&M.active&&Math.abs(M.positionX)<2&&(W+=3.2),M.active&&(W-=2),w.current+=(W-w.current)*.05+(Math.random()-.5)*.35;const ee=p*p*4;X.current.position?.length!==ee&&(X.current={position:new Float32Array(ee),velocity:new Float32Array(ee)}),c.readRenderTargetPixels(A,0,0,p,p,X.current.position),c.readRenderTargetPixels(_,0,0,p,p,X.current.velocity),d.current({temperature:w.current,shafts:ke(X.current.position,X.current.velocity,P,N.streetY)}),S.current=0}}),e.jsx("instancedMesh",{args:[x,v,P],frustumCulled:!1})}const tt=j.forwardRef(function({active:a,brakes:s},n){const c=j.useRef(),i=[j.useRef(),j.useRef()],h=[j.useRef(),j.useRef()];return J(()=>{i.forEach(l=>{a&&(l.current.rotation.y+=.3)});const f=s&&n.current&&Math.abs(n.current.position.x)<2;c.current&&(c.current.position.y=f?-1.8+(Math.random()-.5)*.04:-1.8),h.forEach(l=>{l.current.intensity=f?4+Math.random()*5:0})}),e.jsxs("group",{ref:n,children:[e.jsxs("mesh",{ref:c,position:[0,-1.8,2.5],castShadow:!0,children:[e.jsx("boxGeometry",{args:[16,3.4,2.8]}),e.jsx("meshStandardMaterial",{color:"#b7c7c5",metalness:.82,roughness:.25})]}),[1.06,3.94].map(f=>e.jsxs("group",{children:[[-6.2,-1.7,1.7,6.2].map(l=>e.jsxs("mesh",{position:[l,-1.5,f],children:[e.jsx("boxGeometry",{args:[1.55,1.1,.05]}),e.jsx("meshStandardMaterial",{color:"#17333a",metalness:.4,roughness:.18,emissive:"#0d6872",emissiveIntensity:.35})]},l)),[-4,4].map(l=>e.jsxs("group",{position:[l,-1.8,f],children:[[-.59,.59].map(d=>e.jsxs("group",{position:[d,0,0],children:[e.jsxs("mesh",{children:[e.jsx("boxGeometry",{args:[1.14,2.75,.06]}),e.jsx("meshStandardMaterial",{color:"#8fa3a2",metalness:.75,roughness:.3})]}),e.jsxs("mesh",{position:[0,.55,f<2.5?-.04:.04],children:[e.jsx("boxGeometry",{args:[.78,.88,.035]}),e.jsx("meshStandardMaterial",{color:"#17333a",metalness:.4,roughness:.18,emissive:"#0d6872",emissiveIntensity:.3})]})]},d)),e.jsxs("mesh",{position:[0,0,f<2.5?-.04:.04],children:[e.jsx("boxGeometry",{args:[.045,2.75,.035]}),e.jsx("meshStandardMaterial",{color:"#263638",metalness:.55,roughness:.4})]})]},l))]},f)),[-4,4].map((f,l)=>e.jsxs("group",{children:[e.jsxs("mesh",{position:[f,.1,2.5],children:[e.jsx("boxGeometry",{args:[2.5,.4,1.8]}),e.jsx("meshStandardMaterial",{color:"#33484b",roughness:.8})]}),e.jsxs("mesh",{ref:i[l],position:[f,.35,2.5],children:[e.jsx("boxGeometry",{args:[1.4,.05,.2]}),e.jsx("meshStandardMaterial",{color:"#192427",roughness:.8})]})]},f)),[-6,6].map((f,l)=>e.jsx("pointLight",{ref:h[l],color:"#ff493d",distance:7,position:[f,-3,3.5]},f))]})}),at=[-2.4,-.8,.8,2.4];function rt({settings:t}){const a=j.useRef([]),s=j.useRef([]),n=j.useRef([]),c=I.degToRad(t.roofPitch),i=t.roofOffset,h=4+Math.tan(c)*2.3,f=Math.max(0,t.roofGapHorizontal),l=Math.max(.05,t.roofGapVertical),{streetY:d}=H(t.stairSurfaceOpeningHeight),{leftEndZ:S,rightStartZ:X}=Ve(i,f),w=[...Q(-11,11,-4.6,S),...Q(-11,11,X,4.6)].map(x=>{const v=me(x.startZ,t.roofPitch,i,l),y=me(x.endZ,t.roofPitch,i,l);return{...x,centerX:(x.startX+x.endX)/2,centerY:(v+y)/2,centerZ:(x.startZ+x.endZ)/2,length:Math.hypot(x.endZ-x.startZ,y-v),rotation:Math.atan2(-(y-v),x.endZ-x.startZ)}}),P=Math.hypot(f,l),p=-Math.atan2(l,f);return J((x,v)=>{a.current.forEach(y=>{y&&(y.rotation.x+=v*(2+t.ceilingFans*5))}),s.current.forEach(y=>{y&&(y.rotation.x+=v*(1.5+t.floorAirMovers*6))}),n.current.forEach((y,O)=>{y&&t.shaftFans&&(y.rotation.y+=v*t.shaftFanVelocity*t.shaftControls[O]*5)})}),e.jsxs("group",{children:[e.jsx("group",{children:Z.map((x,v)=>e.jsxs("group",{position:[x,0,-1.4],children:[e.jsxs("mesh",{position:[0,(G.throatY+d)/2,0],children:[e.jsx("boxGeometry",{args:[1.25,d-G.throatY,1.25]}),e.jsx("meshStandardMaterial",{color:"#708b82",metalness:.45,roughness:.55,transparent:!0,opacity:.18,depthWrite:!1})]}),e.jsxs("mesh",{position:[0,d,0],children:[e.jsx("boxGeometry",{args:[1.5,.12,1.5]}),e.jsx("meshStandardMaterial",{color:"#d5b75e",metalness:.7,roughness:.3,transparent:!0,opacity:.65})]}),[-.48,-.24,0,.24,.48].map(y=>e.jsxs("mesh",{position:[0,d+.08,y],children:[e.jsx("boxGeometry",{args:[1.2,.06,.1]}),e.jsx("meshStandardMaterial",{color:"#203b3d",metalness:.78,roughness:.28})]},y)),e.jsxs("mesh",{position:[0,G.throatY,0],children:[e.jsx("boxGeometry",{args:[1.05,.08,1.05]}),e.jsx("meshStandardMaterial",{color:"#1d3536",metalness:.35,roughness:.45})]}),e.jsxs("group",{ref:y=>{n.current[v]=y},position:[0,G.throatY+.14,0],children:[e.jsxs("mesh",{children:[e.jsx("cylinderGeometry",{args:[.46,.46,.08,16]}),e.jsx("meshStandardMaterial",{color:t.shaftFans?"#63b6b1":"#49615e",metalness:.55,roughness:.3})]}),e.jsxs("mesh",{position:[0,.06,0],children:[e.jsx("boxGeometry",{args:[.86,.035,.08]}),e.jsx("meshBasicMaterial",{color:t.shaftFans?"#bce8d5":"#708b82"})]}),e.jsxs("mesh",{position:[0,.06,0],rotation:[0,Math.PI/2,0],children:[e.jsx("boxGeometry",{args:[.86,.035,.08]}),e.jsx("meshBasicMaterial",{color:t.shaftFans?"#bce8d5":"#708b82"})]})]})]},x))}),e.jsx("group",{children:[-6,0,6].map((x,v)=>e.jsxs("group",{ref:y=>{a.current[v]=y},position:[x,3.48,1.4],rotation:[0,0,Math.PI/2],children:[e.jsxs("mesh",{children:[e.jsx("cylinderGeometry",{args:[.42,.42,.14,16]}),e.jsx("meshStandardMaterial",{color:"#63b6b1",emissive:"#165d61",emissiveIntensity:.3,metalness:.55,roughness:.3})]}),e.jsxs("mesh",{position:[0,.05,0],children:[e.jsx("boxGeometry",{args:[.75,.035,.06]}),e.jsx("meshBasicMaterial",{color:"#bce8d5"})]}),e.jsxs("mesh",{position:[0,.05,0],rotation:[0,Math.PI/2,0],children:[e.jsx("boxGeometry",{args:[.75,.035,.06]}),e.jsx("meshBasicMaterial",{color:"#bce8d5"})]})]},x))}),e.jsx("group",{children:T.fanPositions.map((x,v)=>e.jsxs("group",{ref:y=>{s.current[v]=y},position:[x,-2.34,T.floorMoverZ],rotation:[0,0,Math.PI/2],children:[e.jsxs("mesh",{children:[e.jsx("cylinderGeometry",{args:[.42,.42,.14,16]}),e.jsx("meshStandardMaterial",{color:"#d5b75e",emissive:"#7a5421",emissiveIntensity:.35,metalness:.65,roughness:.3})]}),e.jsxs("mesh",{position:[0,.05,0],children:[e.jsx("boxGeometry",{args:[.72,.035,.06]}),e.jsx("meshBasicMaterial",{color:"#f0d38a"})]}),e.jsxs("mesh",{position:[0,.05,0],rotation:[0,Math.PI/2,0],children:[e.jsx("boxGeometry",{args:[.72,.035,.06]}),e.jsx("meshBasicMaterial",{color:"#f0d38a"})]})]},x))}),e.jsx("group",{children:at.map((x,v)=>e.jsxs("mesh",{position:[0,3.95,x],rotation:[0,0,v%2?-.018:.018],children:[e.jsx("boxGeometry",{args:[20,.07,.12]}),e.jsx("meshStandardMaterial",{color:"#254546",emissive:"#1d5d58",emissiveIntensity:.25,roughness:.72})]},x))}),e.jsxs("group",{children:[w.map(x=>e.jsxs("mesh",{position:[x.centerX,x.centerY,x.centerZ],rotation:[x.rotation,0,0],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[x.endX-x.startX,.22,Math.max(.2,x.length)]}),e.jsx("meshStandardMaterial",{color:"#607974",roughness:.78,metalness:.18})]},`${x.startX}:${x.endX}:${x.startZ}:${x.endZ}`)),e.jsx("group",{visible:t.clerestoryWindows,position:[0,h+l/2,i],children:Array.from({length:10},(x,v)=>e.jsxs("mesh",{position:[-9+v*2,0,0],rotation:[p,0,0],children:[e.jsx("boxGeometry",{args:[1.7,.08,P]}),e.jsx("meshStandardMaterial",{color:"#9bdfe1",emissive:"#2f8e83",emissiveIntensity:.2+t.clerestoryOpen*.7,transparent:!0,opacity:.18+t.clerestoryOpen*.42,metalness:.18,roughness:.25})]},v))}),e.jsxs("mesh",{position:[9.65,4.1,0],children:[e.jsx("boxGeometry",{args:[.12,.45,5.8]}),e.jsx("meshBasicMaterial",{color:"#9bd1aa"})]})]})]})}function pe(t,a,s,n){const c=new le;c.moveTo(t[0].startX,t[0].startY+a),t.forEach(h=>c.lineTo(h.endX,h.endY+a)),c.lineTo(t.at(-1).endX,t.at(-1).endY+s),[...t].reverse().forEach(h=>c.lineTo(h.startX,h.startY+s)),c.closePath();const i=n==null?new Te(c):new ce(c,{depth:n,bevelEnabled:!1});return n!=null&&i.translate(0,0,r.z-n/2),i}function ot(t,a){const s=new le;s.moveTo(t[0].startX,a),s.lineTo(t.at(-1).endX,a),s.lineTo(t.at(-1).endX,t.at(-1).endY-.2),[...t].reverse().forEach(c=>s.lineTo(c.startX,c.startY-.2)),s.closePath();const n=new ce(s,{depth:r.width,bevelEnabled:!1});return n.translate(0,0,r.z-r.width/2),n}function it(t,a,s){const n=new le;n.moveTo(r.landingStartX,r.baseY),n.lineTo(r.endX,r.baseY),n.lineTo(r.endX,s+t),n.lineTo(r.upperFlightStartX,a+t),n.lineTo(r.lowerFlightEndX,a+t),n.lineTo(r.startX,r.baseY+t),n.lineTo(r.landingStartX,r.baseY+t),n.closePath();const c=q.stairOuterZ-F.minZ,i=new ce(n,{depth:c,bevelEnabled:!1});return i.translate(0,0,F.minZ),i}function st({tunnelHeight:t,landingY:a,surfaceY:s}){const n=R.maxX-R.minX,c=(R.minX+R.maxX)/2,i=R.bedY-.2-F.minY,h=r.endX-r.landingStartX,f=(r.endX+r.landingStartX)/2,l=r.baseY-.2-F.minY,d=j.useMemo(()=>it(t,a,s),[t,a,s]);return j.useEffect(()=>()=>d.dispose(),[d]),e.jsxs("group",{children:[e.jsxs("mesh",{position:[c,F.minY+i/2,R.centerZ],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[n,i,R.tunnelWidth]}),e.jsx("meshStandardMaterial",{color:"#33403f",roughness:.98})]}),e.jsxs("mesh",{position:[f,F.minY+l/2,r.z],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[h,l,r.width]}),e.jsx("meshStandardMaterial",{color:"#46514e",roughness:.98})]}),e.jsx("mesh",{geometry:d,receiveShadow:!0,children:e.jsx("meshStandardMaterial",{color:"#596763",transparent:!0,opacity:.09,depthWrite:!1,side:K,roughness:.95})})]})}function nt({tunnelHeight:t,landingY:a,surfaceY:s}){const n=r.startX-r.landingStartX,c=(r.landingStartX+r.startX)/2,i=[{id:"lower",startX:r.startX,endX:r.lowerFlightEndX,startY:r.baseY,endY:a},{id:"landing",startX:r.lowerFlightEndX,endX:r.upperFlightStartX,startY:a,endY:a},{id:"upper",startX:r.upperFlightStartX,endX:r.endX,startY:a,endY:s}].map(l=>({...l,centerX:(l.startX+l.endX)/2,centerY:(l.startY+l.endY)/2,length:Math.hypot(l.endX-l.startX,l.endY-l.startY),angle:Math.atan2(l.endY-l.startY,l.endX-l.startX)})),h=j.useMemo(()=>({underfill:ot(i,r.baseY-.2),wall:pe(i,0,t),ceiling:pe(i,t-.04,t+.04,r.width)}),[a,s,t]);j.useEffect(()=>()=>Object.values(h).forEach(l=>l.dispose()),[h]);const f={color:"#9bd1c1",emissive:"#2f8e83",emissiveIntensity:.18,transparent:!0,opacity:.11,depthWrite:!1,side:K};return e.jsxs("group",{children:[e.jsx("mesh",{geometry:h.underfill,receiveShadow:!0,children:e.jsx("meshStandardMaterial",{color:"#596763",transparent:!0,opacity:.09,depthWrite:!1,side:K,roughness:.95})}),e.jsxs("mesh",{position:[c,r.baseY+t,r.z],children:[e.jsx("boxGeometry",{args:[n,.08,r.width]}),e.jsx("meshStandardMaterial",{...f})]}),[-1,1].map(l=>e.jsxs("mesh",{position:[c,r.baseY+t/2,r.z+l*r.width/2],children:[e.jsx("boxGeometry",{args:[n,t,.08]}),e.jsx("meshStandardMaterial",{...f})]},`entry-${l}`)),e.jsx("mesh",{geometry:h.ceiling,children:e.jsx("meshStandardMaterial",{...f})}),[-1,1].map(l=>e.jsx("mesh",{geometry:h.wall,position:[0,0,r.z+l*r.width/2],children:e.jsx("meshStandardMaterial",{...f})},l))]})}function lt(){return e.jsx("group",{children:$.pedestalZ.map(t=>e.jsxs("group",{position:[$.x,r.baseY,t],children:[e.jsxs("mesh",{position:[0,$.pedestalHeight/2,0],castShadow:!0,receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[$.halfDepth*2,$.pedestalHeight,$.pedestalHalfWidth*2]}),e.jsx("meshStandardMaterial",{color:"#324b50",metalness:.72,roughness:.3})]}),e.jsxs("mesh",{position:[0,$.pedestalHeight+.05,0],children:[e.jsx("boxGeometry",{args:[.48,.12,.32]}),e.jsx("meshStandardMaterial",{color:"#79c9bb",emissive:"#1d706b",emissiveIntensity:.45,metalness:.45,roughness:.28})]}),e.jsx("group",{position:[.28,.72,0],rotation:[Math.PI/2,0,0],children:[0,Math.PI*2/3,Math.PI*4/3].map(a=>e.jsxs("mesh",{position:[Math.cos(a)*.3,Math.sin(a)*.3,0],rotation:[0,0,a],children:[e.jsx("boxGeometry",{args:[.62,.055,.055]}),e.jsx("meshStandardMaterial",{color:"#c8d5cf",metalness:.9,roughness:.18})]},a))})]},t))})}function ct({tunnelHeight:t,landingY:a,surfaceY:s}){const{streetY:n}=H(s),c=z.maxX-z.minX,i=(z.minX+z.maxX)/2,h=Ze(a,s,t),f=Q(z.minX,h,z.minZ,U.sidewalkRoadEdgeZ,Z,G.z,U.shaftApertureSize),l=U.sidewalkRoadEdgeZ,d=z.maxZ-l,S=(l+z.maxZ)/2,X=4.8,w=n-X,P=Q(-11,9,z.minZ,z.maxZ);return e.jsxs("group",{children:[P.map(p=>e.jsxs("mesh",{position:[(p.startX+p.endX)/2,X+w/2,(p.startZ+p.endZ)/2],children:[e.jsx("boxGeometry",{args:[p.endX-p.startX,w,p.endZ-p.startZ]}),e.jsx("meshStandardMaterial",{color:"#596763",transparent:!0,opacity:.07,depthWrite:!1,side:K,roughness:.95})]},`insulation:${p.startX}:${p.endX}:${p.startZ}:${p.endZ}`)),e.jsxs("mesh",{position:[i,n-.09,S],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[c,.18,d]}),e.jsx("meshStandardMaterial",{color:"#273238",roughness:.96,metalness:.02})]}),f.map(p=>e.jsxs("mesh",{position:[(p.startX+p.endX)/2,n,(p.startZ+p.endZ)/2],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[p.endX-p.startX,.2,p.endZ-p.startZ]}),e.jsx("meshStandardMaterial",{color:"#7d8582",roughness:.88,metalness:.04})]},`${p.startX}:${p.endX}:${p.startZ}:${p.endZ}`)),e.jsxs("mesh",{position:[i,n+.08,l+.07],children:[e.jsx("boxGeometry",{args:[c,.24,.14]}),e.jsx("meshStandardMaterial",{color:"#c4c8bd",roughness:.78})]}),[0,4.2].map(p=>e.jsxs("mesh",{position:[i,n+.015,p],children:[e.jsx("boxGeometry",{args:[c-1,.025,.1]}),e.jsx("meshBasicMaterial",{color:"#eef0df"})]},p)),Array.from({length:14},(p,x)=>e.jsxs("mesh",{position:[z.minX+2+x*3.4,n+.02,1.8],children:[e.jsx("boxGeometry",{args:[1.8,.03,.12]}),e.jsx("meshBasicMaterial",{color:"#e8b941"})]},x))]})}function ut({enabled:t,flow:a,pumpDirection:s}){const n=j.useRef([]),c=j.useRef([]),i=D.maxX-D.minX,h=(D.minX+D.maxX)/2;return J((f,l)=>{!t||a<=0||(n.current.forEach(d=>{d&&(d.position.x+=l*s*(1.5+a*5),d.position.x>D.maxX&&(d.position.x=D.minX),d.position.x<D.minX&&(d.position.x=D.maxX))}),c.current.forEach(d=>{d&&(d.position.y-=l*(1.5+a*4),d.position.y<E.bottomY&&(d.position.y=E.topY))}))}),e.jsxs("group",{visible:t,children:[e.jsxs("mesh",{position:[h,D.y,D.z],rotation:[0,0,Math.PI/2],children:[e.jsx("cylinderGeometry",{args:[D.radius,D.radius,i,24,1,!0]}),e.jsx("meshStandardMaterial",{color:"#15383e",side:Xe,roughness:.9,metalness:.1,transparent:!0,opacity:.82})]}),e.jsxs("mesh",{position:[h,-6.08,D.z],children:[e.jsx("boxGeometry",{args:[i-.5,.05,1.6]}),e.jsx("meshStandardMaterial",{color:"#21727a",emissive:"#0c4249",emissiveIntensity:.35+a*.45,roughness:.25,metalness:.12})]}),[D.minX,D.maxX].map(f=>e.jsxs("mesh",{position:[f,-5,-4.15],rotation:[0,Math.PI/2,0],children:[e.jsx("torusGeometry",{args:[1.25,.1,12,28]}),e.jsx("meshStandardMaterial",{color:"#d5b75e",metalness:.7,roughness:.34})]},f)),e.jsxs("mesh",{position:[h,-5.72,D.z],rotation:[0,s<0?Math.PI:0,0],children:[e.jsx("boxGeometry",{args:[4.5,.08,.1]}),e.jsx("meshBasicMaterial",{color:"#9bd1aa"})]}),e.jsx("group",{visible:a>0,children:Array.from({length:18},(f,l)=>e.jsxs("mesh",{ref:d=>{n.current[l]=d},position:[D.minX+(l+.5)*i/18,-5.35,D.z],children:[e.jsx("sphereGeometry",{args:[.09+a*.06,8,6]}),e.jsx("meshBasicMaterial",{color:"#77e6e8",transparent:!0,opacity:.45+a*.5})]},l))}),e.jsx("pointLight",{color:"#48cbd1",intensity:.4+a*1.4,distance:7,position:[0,-5.2,-4.15]}),e.jsxs("group",{visible:a>0,children:[e.jsxs("mesh",{position:[E.x,(E.topY+E.bottomY)/2,E.z],children:[e.jsx("boxGeometry",{args:[1.35,E.topY-E.bottomY,.06]}),e.jsx("meshStandardMaterial",{color:"#68d9e1",emissive:"#167782",emissiveIntensity:.7+a,transparent:!0,opacity:.12+a*.28,roughness:.18})]}),Array.from({length:12},(f,l)=>e.jsxs("mesh",{ref:d=>{c.current[l]=d},position:[E.x-.55+l%4*.36,E.topY-l%6*.45,E.z+.04],children:[e.jsx("sphereGeometry",{args:[.07+a*.04,7,5]}),e.jsx("meshBasicMaterial",{color:"#a4f4f0",transparent:!0,opacity:.55+a*.4})]},l)),e.jsx("pointLight",{color:"#55dce2",intensity:.5+a*1.8,distance:6,position:[E.x,-4,E.z]})]})]})}function ft({landingY:t,surfaceY:a}){const s=e.jsx("meshStandardMaterial",{color:"#52646a",roughness:.88}),n=R.maxX-R.minX,c=(R.minX+R.maxX)/2,i=R.bedY+R.tunnelHeight/2,h=[{startX:r.startX,endX:r.lowerFlightEndX,startY:r.baseY,endY:t,count:r.lowerStepCount},{startX:r.upperFlightStartX,endX:r.endX,startY:t,endY:a,count:r.upperStepCount}],f=r.startX-r.landingStartX,l=r.topLandingEndX-r.endX;return e.jsxs("group",{children:[e.jsxs("mesh",{position:[0,se-.75,-2.5],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[22,1.5,4]}),s]}),e.jsxs("mesh",{position:[0,se+.02,-.6],children:[e.jsx("boxGeometry",{args:[22,.05,.3]}),e.jsx("meshBasicMaterial",{color:"#e5bd42"})]}),e.jsxs("mesh",{position:[c,R.bedY,R.centerZ],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[n,.4,R.width]}),e.jsx("meshStandardMaterial",{color:"#111e21",roughness:.95})]}),[-1.5,0,1.5].map(d=>e.jsxs("mesh",{position:[c,R.bedY+.25,R.centerZ+d],children:[e.jsx("boxGeometry",{args:[n,.08,.08]}),e.jsx("meshStandardMaterial",{color:"#b3c3bf",metalness:.9,roughness:.22})]},d)),e.jsxs("mesh",{position:[c,i,R.centerZ],children:[e.jsx("boxGeometry",{args:[n,R.tunnelHeight,R.tunnelWidth]}),e.jsx("meshStandardMaterial",{color:"#8fb8b5",transparent:!0,opacity:.035,depthWrite:!1,side:K,roughness:.2,metalness:.08})]}),e.jsxs("mesh",{position:[(r.landingStartX+r.startX)/2,r.baseY-.1,r.z],children:[e.jsx("boxGeometry",{args:[f,.2,r.width]}),s]}),e.jsxs("mesh",{position:[(r.lowerFlightEndX+r.upperFlightStartX)/2,t-.1,r.z],children:[e.jsx("boxGeometry",{args:[r.upperFlightStartX-r.lowerFlightEndX,.2,r.width]}),s]}),e.jsxs("mesh",{position:[r.endX+l/2,a-.1,r.z],children:[e.jsx("boxGeometry",{args:[l,.2,r.width]}),s]}),h.flatMap(d=>{const S=(d.endX-d.startX)/d.count;return Array.from({length:d.count},(X,w)=>{const P=d.startX+(w+.5)*S,p=Be(P,r.baseY,t,a);return e.jsxs("mesh",{position:[P,p-.1,r.z],children:[e.jsx("boxGeometry",{args:[S+r.nosingDepth,.2,r.width]}),s]},`${d.startX}:${w}`)})}),[-8,-4,0,4].map(d=>e.jsxs("mesh",{position:[d,.5,-.6],children:[e.jsx("boxGeometry",{args:[.3,7,.3]}),e.jsx("meshStandardMaterial",{color:"#235160",metalness:.6,roughness:.36})]},d)),be.map((d,S)=>e.jsxs("mesh",{position:[d.x,d.y,d.z],children:[e.jsx("cylinderGeometry",{args:[.18,.18,1.5,8]}),e.jsx("meshStandardMaterial",{color:S%2?"#384f55":"#23363c",roughness:.86})]},S))]})}function mt({viewMode:t,parametersVisible:a,onManualChange:s}){const{camera:n,gl:c,size:i}=ye(),h=j.useRef(),f=j.useRef(new V(...ne.find(p=>p.id==="ortho1").position)),l=j.useRef(new V(...re)),d=j.useRef(new V),S=j.useRef(new V),X=j.useRef(!1),w=j.useRef(s);w.current=s,j.useEffect(()=>{const p=ne.find(O=>O.id===t);t&&(X.current=!1);const x=new V(...p?.position??n.position.toArray());p?.position||x.sub(d.current);const v=new V(...re),y=he(n,x,v,i,a);S.current.copy(y),f.current.copy(x),l.current.copy(v)},[n,a,i,t]),J((p,x)=>{if(!h.current)return;const v=1-Math.exp(-x*5.5),y=n.position.clone().sub(d.current);!X.current&&t&&(t!=="orbital"&&y.lerp(f.current,v),h.current.target.lerp(l.current,v));const O=!X.current&&t&&t!=="orbital"?f.current:y,u=he(n,O,l.current,i,a);S.current.copy(u),d.current.lerp(S.current,v),n.position.copy(y).add(d.current)});const P=()=>{X.current=!0,w.current()};return j.useEffect(()=>{const p=()=>{X.current=!0,w.current()};return c.domElement.addEventListener("wheel",p,{capture:!0,passive:!0}),()=>c.domElement.removeEventListener("wheel",p,{capture:!0})},[c]),e.jsx(Pe,{ref:h,makeDefault:!0,target:re,enableDamping:!0,dampingFactor:.08,minDistance:12,maxDistance:90,autoRotate:t==="orbital",autoRotateSpeed:.55,onStart:P})}function dt({settings:t,viewMode:a,parametersVisible:s,onManualViewChange:n,onTelemetry:c,onGpuError:i}){const h=j.useRef(),f={tunnelHeight:t.stairUndergroundOpeningHeight,landingY:t.stairLandingHeight,surfaceY:t.stairSurfaceOpeningHeight};return e.jsxs(e.Fragment,{children:[e.jsx("ambientLight",{color:"#8ab0ae",intensity:1.25}),e.jsx("directionalLight",{color:"#fff4dd",intensity:2.3,position:[10,20,15],castShadow:!0}),e.jsx(ft,{...f}),e.jsx(st,{...f}),e.jsx(lt,{}),e.jsx(rt,{settings:t}),e.jsx(nt,{...f}),e.jsx(ct,{...f}),e.jsx(ut,{enabled:t.floodTunnels,flow:t.floodFlow,pumpDirection:t.floodPumpDirection}),e.jsx(tt,{ref:h,active:t.train,brakes:t.brakes}),e.jsx(et,{settings:t,trainRef:h,onTelemetry:c,onGpuError:i},t.particleCount),e.jsx(we,{position:[9,-4,0],opacity:.42,scale:56,blur:2.5,far:8}),e.jsx(mt,{viewMode:a,parametersVisible:s,onManualChange:n})]})}function ht({values:t}){const a=t.map((s,n)=>`${n/(t.length-1)*250},${60-(s-78)/14*52}`).join(" ");return e.jsxs("svg",{className:"sparkline",viewBox:"0 0 250 64",preserveAspectRatio:"none","aria-label":"Station temperature history",children:[e.jsx("path",{d:"M0 48 H250 M0 28 H250",className:"sparkline-grid"}),e.jsx("polyline",{points:a,className:"sparkline-line"})]})}function B({label:t,checked:a,onChange:s,description:n,showDescription:c}){return e.jsxs("label",{className:"toggle-row",children:[e.jsx("input",{type:"checkbox",checked:a,onChange:i=>s(i.target.checked)}),e.jsx("span",{className:"toggle-track",children:e.jsx("span",{})}),e.jsxs("span",{className:"toggle-copy",children:[e.jsx("span",{children:t}),c&&e.jsx("small",{className:"parameter-description",children:n})]})]})}function C({label:t,value:a,min:s,max:n,step:c,precision:i,suffix:h,description:f,showDescription:l,onChange:d,editing:S=!1,isDefault:X=!0,onReset:w}){return e.jsx(Ne,{className:"slider-control",label:t,value:Number.isFinite(a)?a:s,min:s,max:n,step:c,suffix:h,editing:S,isDefault:X,onReset:w,description:f,showDescription:l,onChange:d})}function xe({history:t,metric:a,label:s,unit:n}){const c=t.flatMap(w=>[w?.intake?.[a],w?.outlet?.[a]]).filter(Number.isFinite),i=a==="flow"?Math.max(1,...c.map(Math.abs)):null,[h,f]=a==="flow"?[-i,i]:He(c),l=a==="temperature"?`${h}–${f} ${n}`:n,d=w=>a==="flow"?w===0?"0":w.toFixed(1):`${Number.isInteger(w)?w:w.toFixed(1)}°`,S=[f,(h+f)/2,h],X=w=>t.map((P,p)=>{const x=P?.[w]?.[a];if(!Number.isFinite(x))return null;const v=t.length>1?p/(t.length-1)*220:220,y=42-(x-h)/(f-h)*38;return`${v},${Math.max(2,Math.min(42,y))}`}).filter(Boolean).join(" ");return e.jsxs("div",{className:"vent-chart",children:[e.jsxs("div",{className:"vent-chart-heading",children:[e.jsx("span",{children:s}),e.jsx("span",{children:l})]}),e.jsxs("div",{className:"vent-chart-body",children:[e.jsx("div",{className:"vent-chart-y-axis","aria-hidden":"true",children:S.map(w=>e.jsx("span",{children:d(w)},w))}),e.jsxs("svg",{viewBox:"0 0 220 44",preserveAspectRatio:"none","aria-label":`${s} history`,children:[e.jsx("line",{x1:"0",y1:"2",x2:"220",y2:"2",className:"vent-chart-grid"}),e.jsx("line",{x1:"0",y1:"22",x2:"220",y2:"22",className:"vent-chart-grid"}),e.jsx("line",{x1:"0",y1:"42",x2:"220",y2:"42",className:"vent-chart-grid"}),e.jsx("polyline",{points:X("intake"),className:"vent-chart-line intake"}),e.jsx("polyline",{points:X("outlet"),className:"vent-chart-line outlet"})]})]})]})}function pt({settings:t,telemetry:a,onSettingsChange:s,showDescriptions:n}){const[c,i]=j.useState(()=>Z.map(()=>[]));j.useEffect(()=>{a.shafts.length===Z.length&&i(f=>f.map((l,d)=>[...l.slice(-35),a.shafts[d]]))},[a.shafts]);const h=(f,l)=>{const d=[...t.shaftControls];d[f]=l,s({shaftControls:d})};return e.jsxs("details",{className:"parameter-group vent-flow-group",children:[e.jsx("summary",{children:"Vent flow charts"}),e.jsx("div",{className:"vent-flow-list",children:Z.map((f,l)=>{const d=a.shafts[l];return e.jsxs("section",{className:"vent-flow-shaft",children:[e.jsx(C,{label:`${Se[l]} shaft (${f>0?"+":""}${f} m)`,value:t.shaftControls[l],min:-1,max:1,step:.05,suffix:"",description:"Sets signed ventilation speed for this shaft; negative values reverse vertical flow.",showDescription:n,onChange:S=>h(l,S)}),e.jsx("div",{className:"vent-endpoints",children:["intake","outlet"].map(S=>e.jsxs("div",{className:"vent-endpoint",children:[e.jsx("span",{children:S}),e.jsx("strong",{children:Number.isFinite(d?.[S]?.flow)?`${d[S].flow.toFixed(2)} m/s`:"--"}),e.jsxs("small",{children:[Number.isFinite(d?.[S]?.temperature)?`${d[S].temperature.toFixed(1)}°F`:"--"," · n=",d?.[S]?.count??0]})]},S))}),e.jsx(xe,{history:c[l],metric:"flow",label:"Vertical flow",unit:"m/s"}),e.jsx(xe,{history:c[l],metric:"temperature",label:"Air temperature",unit:"°F"}),e.jsxs("div",{className:"vent-chart-legend",children:[e.jsx("span",{className:"intake",children:"Intake"}),e.jsx("span",{className:"outlet",children:"Outlet"})]})]},f)})})]})}function ge({title:t,items:a,tone:s}){const n=Math.max(...a.map(c=>c.points),1);return e.jsxs("section",{className:"report-contributions",children:[e.jsxs("div",{className:"report-section-heading",children:[e.jsx("span",{children:t}),e.jsxs("strong",{children:[a.reduce((c,i)=>c+i.points,0).toFixed(1)," pts"]})]}),e.jsx("div",{className:"contribution-list",children:a.map(c=>e.jsxs("div",{className:"contribution-row",children:[e.jsxs("div",{className:"contribution-label",children:[e.jsx("span",{children:c.label}),e.jsxs("strong",{className:`contribution-points ${s}`,children:[s==="positive"?"+":"-",c.points.toFixed(1)]})]}),e.jsx("div",{className:"contribution-track",children:e.jsx("span",{className:s,style:{width:`${c.points/n*100}%`}})}),e.jsx("small",{children:c.description})]},c.key))})]})}function xt({report:t,onClose:a}){return e.jsx("div",{className:"report-layer",onClick:a,children:e.jsxs("section",{className:"report-screen panel",role:"dialog","aria-modal":"true","aria-labelledby":"resilience-report-title",onClick:s=>s.stopPropagation(),children:[e.jsxs("header",{className:"report-header",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"panel-kicker",children:[e.jsx("span",{className:"status-dot"}),"THERMAL RESILIENCE / FIELD REPORT"]}),e.jsx("h2",{id:"resilience-report-title",children:"What is moving the score"})]}),e.jsx("button",{className:"report-close",type:"button",onClick:a,"aria-label":"Close thermal resilience report",children:"Close"})]}),e.jsxs("div",{className:"report-score-block",children:[e.jsx("span",{children:"Current resilience"}),e.jsxs("strong",{children:[t.score,"%"]}),e.jsx("div",{className:"sustainability-meter",children:e.jsx("span",{style:{width:`${t.score}%`}})}),e.jsx("p",{children:"Higher scores favor passive heat removal and penalize powered air movement."})]}),e.jsxs("div",{className:"report-equation",children:[e.jsx("span",{children:"Baseline"}),e.jsx("strong",{children:t.baseline.toFixed(0)}),e.jsx("span",{children:"+"}),e.jsx("strong",{className:"positive-text",children:t.passiveTotal.toFixed(1)}),e.jsx("span",{children:"-"}),e.jsx("strong",{className:"negative-text",children:t.activeTotal.toFixed(1)}),e.jsx("span",{children:"="}),e.jsx("strong",{children:t.score})]}),e.jsx(ge,{title:"Passive cooling credits",items:t.passive,tone:"positive"}),e.jsx(ge,{title:"Active airflow load",items:t.active,tone:"negative"}),e.jsxs("div",{className:"report-note",children:[e.jsx("strong",{children:"Field note"}),e.jsx("span",{children:"Surface temperature changes floor buoyancy and particle heat, but remains a physical input rather than a resilience-score credit or penalty."})]})]})})}function gt({settings:t,onSettingsChange:a,telemetry:s,gpuError:n,sustainabilityScore:c,showDescriptions:i,onShowDescriptionsChange:h,onOpenReport:f,onHide:l,editing:d=!1,onEditing:S=()=>{},canUndo:X=!1,canRedo:w=!1,onUndo:P=()=>{},onRedo:p=()=>{},onReset:x=()=>{}}){const{temperature:v}=s,[y,O]=j.useState(()=>new Array(48).fill(81.5));return j.useEffect(()=>{O(u=>[...u.slice(-47),v])},[v]),e.jsx("aside",{className:"telemetry-panel panel",children:e.jsxs(Oe,{editing:d,children:[e.jsxs("div",{className:"panel-topline",children:[e.jsxs("div",{className:"subway-editor-toolbar",children:[e.jsx(ze,{checked:d,onChange:S}),e.jsx(Ge,{canUndo:X,canRedo:w,onUndo:P,onRedo:p})]}),e.jsxs("div",{className:"panel-kicker",children:[e.jsx("span",{className:`status-dot ${n?"status-error":""}`}),"LIVE / TEST CHAMBER"]}),e.jsx("button",{className:"panel-hide",type:"button",onClick:l,children:"Hide"})]}),e.jsxs("div",{className:"telemetry-heading",children:[e.jsx("span",{children:"Ambient field"}),e.jsxs("strong",{children:[v.toFixed(1),"°F"]})]}),e.jsx(ht,{values:y}),n&&e.jsxs("p",{className:"error-copy",children:["GPU field offline: ",n]}),e.jsxs("div",{className:"sustainability-readout",children:[e.jsxs("div",{className:"sustainability-heading",children:[e.jsx("span",{children:"Thermal resilience"}),e.jsxs("strong",{children:[c,"%"]})]}),e.jsx("div",{className:"sustainability-meter",children:e.jsx("span",{style:{width:`${c}%`}})}),e.jsxs("div",{className:"balance-labels",children:[e.jsx("span",{children:"PASSIVE FIRST"}),e.jsx("span",{children:"LOW ENERGY LOAD"})]}),e.jsx("button",{className:"report-link",type:"button",onClick:f,children:"Open resilience report"})]}),e.jsx("div",{className:"description-toggle",children:e.jsx(B,{label:"Show descriptions",checked:i,onChange:h})}),e.jsxs("div",{className:"primary-parameter",children:[e.jsx(C,{label:"Surface temperature",value:t.surfaceTemperature,min:60,max:110,step:.5,suffix:"°F",description:"Sets the station floor's thermal influence on nearby air.",showDescription:i,onChange:u=>a({surfaceTemperature:u})}),e.jsx(C,{label:"Passenger heat",value:t.passengerHeat,min:0,max:1.5,step:.05,suffix:"",description:"Adds localized body heat around the visible passengers.",showDescription:i,onChange:u=>a({passengerHeat:u})}),e.jsx(C,{label:"Road surface temperature",value:t.roadSurfaceTemperature,min:45,max:130,step:.5,suffix:"°F",description:"Sets the outdoor road temperature that drives upward convection above the street.",showDescription:i,onChange:u=>a({roadSurfaceTemperature:u})}),e.jsx(C,{label:"Ambient air above road",value:t.ambientAirTemperature,min:40,max:110,step:.5,suffix:"°F",description:"Sets the outdoor air temperature that the upper field gradually approaches.",showDescription:i,onChange:u=>a({ambientAirTemperature:u})}),e.jsx(C,{label:"Surface crosswind",value:t.surfaceCrosswind,min:-8,max:8,step:.25,suffix:" m/s",description:"Sets outdoor wind across the station along the Z axis; negative values reverse direction.",showDescription:i,onChange:u=>a({surfaceCrosswind:u})}),e.jsx(C,{label:"Stair underground opening",value:t.stairUndergroundOpeningHeight,min:2.2,max:5,step:.1,precision:2,suffix:" m",description:"Sets underground tunnel and doorway clear height without moving the stairs or turnstiles.",showDescription:i,onChange:u=>a({stairUndergroundOpeningHeight:u})}),e.jsx(C,{label:"Stair landing height",value:t.stairLandingHeight,min:1,max:5,step:.1,precision:2,suffix:" m",description:"Sets the level elevation between the lower and upper stair flights.",showDescription:i,onChange:u=>a({stairLandingHeight:u})}),e.jsx(C,{label:"Stair surface opening",value:t.stairSurfaceOpeningHeight,min:8.2,max:10,step:.1,precision:2,suffix:" m",description:"Sets the street opening elevation and moves the street and ventilation outlets with it.",showDescription:i,onChange:u=>a({stairSurfaceOpeningHeight:u})})]}),e.jsxs("div",{className:"toggles-group",children:[e.jsx(B,{label:"Allow trains to run",checked:t.train,description:"Runs one train through the station at the configured interval.",showDescription:i,onChange:u=>a({train:u})}),e.jsx(B,{label:"Powered shaft fans",checked:t.shaftFans,description:"Adds powered upward airflow in the three ventilation shafts.",showDescription:i,onChange:u=>a({shaftFans:u})}),e.jsx(B,{label:"Clerestory windows",checked:t.clerestoryWindows,description:"Shows the bridging windows and enables clerestory exchange.",showDescription:i,onChange:u=>a({clerestoryWindows:u})}),e.jsx(B,{label:"Wind resistance / occlusion",checked:t.windOcclusion,description:"Deflects airflow around station columns, platforms, and the train.",showDescription:i,onChange:u=>a({windOcclusion:u})}),e.jsx(B,{label:"AC exhaust heat",checked:t.ac,description:"Adds heat and lift near the active train.",showDescription:i,onChange:u=>a({ac:u})}),e.jsx(B,{label:"Brake friction",checked:t.brakes,description:"Adds localized heat and turbulence during braking.",showDescription:i,onChange:u=>a({brakes:u})}),e.jsx(B,{label:"Flood control tunnels",checked:t.floodTunnels,description:"Enables the below-station cold-sink gallery.",showDescription:i,onChange:u=>a({floodTunnels:u})})]}),e.jsxs("div",{className:"systems-group",children:[e.jsx("div",{className:"subsection-label",children:"SUSTAINABLE AIRFLOW SYSTEMS"}),e.jsx(C,{label:"Shaft exchange",value:t.shaftExchange,min:0,max:1,step:.05,suffix:"",description:"Captures air toward the three passive vertical shafts.",showDescription:i,onChange:u=>a({shaftExchange:u})}),e.jsx(C,{label:"Shaft fan velocity",value:t.shaftFanVelocity,min:0,max:8,step:.25,suffix:" m/s",description:"Sets upward powered airflow through each ventilation shaft.",showDescription:i,onChange:u=>a({shaftFanVelocity:u})}),e.jsx(C,{label:"Downward fans",value:t.downFans,min:0,max:1,step:.05,suffix:"",description:"Pushes air down from the station ceiling fan banks.",showDescription:i,onChange:u=>a({downFans:u})}),e.jsx(C,{label:"Floor air movers",value:t.floorAirMovers,min:0,max:1,step:.05,suffix:"",description:"Blows air across the platform floor toward the stair route.",showDescription:i,onChange:u=>a({floorAirMovers:u})}),e.jsx(C,{label:"Ceiling flow",value:t.ceilingFans,min:0,max:1,step:.05,suffix:"",description:"Sweeps the warm ceiling band toward the egress.",showDescription:i,onChange:u=>a({ceilingFans:u})}),e.jsx(C,{label:"Passive grooves",value:t.grooves,min:0,max:1,step:.05,suffix:"",description:"Adds low-energy guidance along the roof grooves.",showDescription:i,onChange:u=>a({grooves:u})}),e.jsx(C,{label:"Roof pitch",value:t.roofPitch,min:-28,max:28,step:1,suffix:"°",description:"Tilts the roof envelope and changes buoyant headroom.",showDescription:i,onChange:u=>a({roofPitch:u})}),e.jsx(C,{label:"Ridge offset",value:t.roofOffset,min:-2,max:2,step:.1,suffix:" z",description:"Moves the roof ridge across the station width.",showDescription:i,onChange:u=>a({roofOffset:u})}),e.jsx(C,{label:"Roof gap: horizontal",value:t.roofGapHorizontal,min:.1,max:2.4,step:.1,suffix:" m",description:"Sets the horizontal distance between the two roof panels.",showDescription:i,onChange:u=>a({roofGapHorizontal:u})}),e.jsx(C,{label:"Roof gap: vertical",value:t.roofGapVertical,min:.1,max:3,step:.1,suffix:" m",description:"Sets the height bridged by each clerestory pane.",showDescription:i,onChange:u=>a({roofGapVertical:u})}),e.jsx(C,{label:"Clerestory opening",value:t.clerestoryOpen,min:0,max:1,step:.05,suffix:"",description:"Controls passive exchange through the clerestory span.",showDescription:i,onChange:u=>a({clerestoryOpen:u})}),e.jsx(C,{label:"Shaft stack effect",value:t.stackEffect,min:0,max:1,step:.05,suffix:"",description:"Applies passive localized shaft lift to warm air; powered fans and crosswind draw remain separate.",showDescription:i,onChange:u=>a({stackEffect:u})}),e.jsx(C,{label:"Flood gallery flow",value:t.floodFlow,min:0,max:1,step:.05,suffix:"",description:"Pulls warm lower air into the gallery as a cold sink.",showDescription:i,onChange:u=>a({floodFlow:u})}),e.jsx(C,{label:"Flood pump direction",value:t.floodPumpDirection,min:-1,max:1,step:.1,suffix:"",description:"Sets the flood-gallery air-pump direction along X.",showDescription:i,onChange:u=>a({floodPumpDirection:u})})]}),e.jsxs("div",{className:"controls-group",children:[e.jsx("div",{className:"subsection-label",children:"SIMULATION"}),e.jsx(C,{label:"Train interval",value:t.trainInterval,min:8,max:60,step:1,suffix:" s",description:"Time from the start of one train pass to the next.",showDescription:i,onChange:u=>a({trainInterval:u})}),e.jsx(C,{label:"Train stop frequency",value:t.trainStopFrequency,min:0,max:1,step:.05,suffix:"",description:"Sets the fraction of train passes that stop at the platform.",showDescription:i,onChange:u=>a({trainStopFrequency:u})}),e.jsx(C,{label:"Train stop duration",value:t.trainStopDuration,min:0,max:30,step:1,suffix:" s",description:"Sets how long a stopping train dwells at the platform.",showDescription:i,onChange:u=>a({trainStopDuration:u})}),e.jsx(C,{label:"Particle count",value:t.particleCount,min:1024,max:9216,step:512,suffix:"",description:"Rebuilds the GPU field with the selected number of rendered particles.",showDescription:i,onChange:u=>a({particleCount:u})}),e.jsx(C,{label:"Particle diameter",value:t.particleDiameter,min:.2,max:1.4,step:.05,suffix:" m",description:"Changes the rendered diameter of each airflow particle.",showDescription:i,onChange:u=>a({particleDiameter:u})}),e.jsx(C,{label:"Velocity diameter response",value:t.particleMagnitudeScale,min:0,max:2,step:.05,suffix:"",description:"Scales individual particle diameter according to velocity magnitude.",showDescription:i,onChange:u=>a({particleMagnitudeScale:u})})]}),e.jsx(pt,{settings:t,telemetry:s,onSettingsChange:a,showDescriptions:i}),e.jsxs("details",{className:"parameter-group",children:[e.jsx("summary",{children:"Fluid parameters"}),e.jsxs("div",{className:"controls-group",children:[e.jsx(C,{label:"Air density",value:t.density,min:.5,max:3,step:.05,suffix:" kg/m³",description:"Mass packed into each simulated air volume.",showDescription:i,onChange:u=>a({density:u})}),e.jsx(C,{label:"Fluid stiffness",value:t.stiffness,min:1,max:20,step:.5,suffix:"",description:"How strongly nearby particles resist compression.",showDescription:i,onChange:u=>a({stiffness:u})}),e.jsx(C,{label:"Viscosity",value:t.viscosity,min:.001,max:.05,step:.001,suffix:" Pa·s",description:"How quickly neighboring air velocities blend.",showDescription:i,onChange:u=>a({viscosity:u})})]})]})]})})}function yt({viewMode:t,onViewChange:a,parametersVisible:s,onToggleParameters:n}){return e.jsxs("nav",{className:"view-toolbar panel","aria-label":"Camera views",children:[e.jsx("div",{className:"view-modes",role:"group","aria-label":"Select camera perspective",children:ne.map(c=>e.jsx("button",{type:"button",className:t===c.id?"active":"","aria-pressed":t===c.id,onClick:()=>a(c.id),children:c.label},c.id))}),e.jsx("button",{className:"params-toggle",type:"button","aria-pressed":s,onClick:n,children:s?"Hide params":"Show params"})]})}function Xt({onBack:t}){const a=$e(b),{value:s,commit:n,load:c,canUndo:i,canRedo:h,undo:f,redo:l}=a,[d,S]=j.useState(!1),[X,w]=j.useState(!1),[P,p]=j.useState(!0),[x,v]=j.useState("ortho1"),[y,O]=j.useState(!1),[u,Y]=j.useState({temperature:81.5,shafts:[]}),[m,L]=j.useState("");Ee({undo:f,redo:l,canUndo:i,canRedo:h,isTextEditing:M=>["INPUT","TEXTAREA","SELECT"].includes(M.tagName)});const g=M=>n(A=>({...A,...M})),N=Le(s);return j.useEffect(()=>{if(!y)return;const M=A=>{A.key==="Escape"&&O(!1)};return window.addEventListener("keydown",M),()=>window.removeEventListener("keydown",M)},[y]),e.jsxs("main",{className:"app-shell",children:[e.jsx("div",{className:"scene-layer",children:e.jsxs(je,{camera:{position:[7,20,55],fov:45,near:.1,far:1e3},dpr:[1,2],gl:{antialias:!0,powerPreference:"high-performance"},children:[e.jsx("color",{attach:"background",args:["#071316"]}),e.jsx("fog",{attach:"fog",args:["#071316",28,72]}),e.jsx(dt,{settings:s,viewMode:x,parametersVisible:P,onManualViewChange:()=>v(null),onTelemetry:Y,onGpuError:L})]})}),e.jsxs("header",{className:"topbar",children:[e.jsxs("div",{className:"brand-lockup",children:[e.jsx("span",{className:"brand-mark",children:"T"}),e.jsxs("span",{children:[e.jsx("b",{children:"TRANSIT / UNDERGROUND"}),e.jsx("em",{children:"Thermodynamics lab"})]})]}),e.jsxs("div",{className:"topbar-meta",children:[e.jsx("span",{children:"GPGPU / SPH"}),e.jsx("span",{children:"FIELD 04"})]}),e.jsx("button",{className:"mode-switch",type:"button",onClick:t,children:"Lab menu"})]}),e.jsx(yt,{viewMode:x,onViewChange:v,parametersVisible:P,onToggleParameters:()=>p(M=>!M)}),P&&e.jsx(gt,{settings:s,onSettingsChange:g,telemetry:u,gpuError:m,sustainabilityScore:N.score,showDescriptions:X,onShowDescriptionsChange:w,onOpenReport:()=>O(!0),onHide:()=>p(!1),editing:d,onEditing:S,canUndo:i,canRedo:h,onUndo:f,onRedo:l,onReset:()=>c(b)}),e.jsxs("aside",{className:"legend-panel panel",children:[e.jsxs("div",{className:"legend-heading",children:[e.jsx("span",{children:"Thermal dispersion"}),e.jsx("span",{className:"legend-unit",children:"NORMALIZED / 0—1"})]}),e.jsx("div",{className:"gradient-bar"}),e.jsxs("div",{className:"legend-labels",children:[e.jsxs("span",{children:["60°F ",e.jsx("small",{children:"cool air"})]}),e.jsxs("span",{children:["85°F ",e.jsx("small",{children:"mixed"})]}),e.jsxs("span",{children:["110°F ",e.jsx("small",{children:"heat input"})]})]})]}),y&&e.jsx(xt,{report:N,onClose:()=>O(!1)}),e.jsxs("footer",{className:"footer-note",children:[e.jsx("span",{children:"PLATFORM 04 / ACTIVE"}),e.jsx("span",{children:"Drag to orbit · Scroll to zoom"})]})]})}export{Xt as SubwaySim};
