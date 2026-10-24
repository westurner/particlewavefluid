import{b,j as e}from"./react-Bwx2ax-9.js";import{C as we,b as Pe,u as J,a as ge}from"./react-three-DWpeIH4f.js";import{D as K,a2 as Z,al as Xe,v as Ce,ag as Fe,f as Me,aa as Ye,e as ae,h as B,E as Te,am as le,an as ce,ao as Re}from"./three-core-BS9w8j8o.js";import{c as De,a as Oe}from"./gpuParticleRuntime-DF89lSKF.js";import{u as Ee,D as $e,b as ze,S as Ae,C as Ne,q as Ge,t as ke,g as He,H as Ie,O as Ve,h as Le,j as Ze,x as Be,N as We}from"./SimulatorBase-CP7qHxMT.js";import{g as Ue,h as ue}from"./mechanicsModels-DVbAqE3C.js";import"./three-extras-DuUFURCc.js";import"./simulationMechanics-CvE8DwpE.js";const C={minX:-48,maxX:48,minY:-6.2,maxY:32,minZ:-5,maxZ:5},fe={minY:-5.5,maxY:5},ie=5,re={minimumHeight:1.25,ceilingMargin:1.5,strength:.8};function Se(t,a){const s=Math.floor(t/ie),c=Math.ceil(a/ie);return(Math.min(s,c-1)+.5)/c}function _e(t,a,s=A.minY,c=C.maxY){const f=Se(t,a);return s+(c-s)*f}const se=-2.5,r={landingStartX:9.4,startX:11,lowerFlightEndX:19.5,upperFlightStartX:22.5,endX:32,topLandingEndX:33.6,baseY:se,landingY:3.35,riseY:12.5,z:-2.5,width:2.8,tunnelHeight:3.2,lowerStepCount:30,upperStepCount:34,nosingDepth:.035},E={x:8.65,halfDepth:.42,pedestalHalfWidth:.12,pedestalHeight:1.15,pedestalZ:[-3.7,-2.9,-2.1,-1.3]},U=[-7,0,7],be=["West","Central","East"],N={z:-1.4,throatY:3.6,outletY:8,streetY:10};function qe(t,a,s,c=N.streetY){const f=[{key:"intake",y:N.throatY},{key:"outlet",y:c}];return U.map((i,d)=>{const m=Object.fromEntries(f.map(({key:n,y:p})=>{const S=[];for(let v=0;v<s;v+=1){const w=v*4,y=t[w]-i,D=t[w+1]-p,u=t[w+2]-N.z;Math.abs(y)>3.4||Math.abs(u)>3.5||S.push({offset:w,distanceSquared:y**2+D**2+u**2})}const F=S.sort((v,w)=>v.distanceSquared-w.distanceSquared).slice(0,8);let j=0,P=0,x=0;return F.forEach(({offset:v,distanceSquared:w})=>{const y=1/(w+.01);j+=a[v+1]*y,P+=a[v+3]*y,x+=y}),[n,F.length>0?{flow:j/x,temperature:60+P/x*50,count:F.length}:{flow:null,temperature:null,count:0}]}));return{id:d,label:be[d],x:i,...m}})}function Ke(t,a=4){const s=t.filter(Number.isFinite);if(s.length===0)return[60,110];const c=Math.min(...s),f=Math.max(...s),i=(c+f)/2,d=Math.max(a,f-c),m=Math.max(.5,d*.1);return[Math.floor(i-d/2-m),Math.ceil(i+d/2+m)]}const A={minX:-15.5,maxX:34,minY:10,maxY:13,minZ:-4.8,maxZ:4.8},_={sidewalkRoadEdgeZ:-.55,shaftApertureSize:1.5,sidewalkThickness:.2,surfaceParticleFloorY:10.22},je=Array.from({length:18},(t,a)=>({x:-6+a*37%120/10,y:-1.75,z:-2-a*17%15/10}));function Je(t=r.riseY){const a=r.baseY+t;return{stairHeight:t,streetY:a,streetMaxY:a+(A.maxY-A.minY),shaftOutletY:a+(N.outletY-N.streetY),surfaceParticleFloorY:a+(_.surfaceParticleFloorY-A.minY)}}function L(t=r.baseY+r.riseY){return Je(t-r.baseY)}const H={startX:35,endX:-35,traversalSeconds:8},Y={minX:Math.min(H.startX,H.endX)-8,maxX:Math.max(H.startX,H.endX)+8,bedY:-3.8,centerZ:2.5,width:5,tunnelHeight:5.4,tunnelWidth:5.8},q={trackFloorY:Y.bedY+.2,stairFloorY:r.baseY,stairOuterZ:r.z-r.width/2},R={minX:Y.minX,maxX:Y.maxX,y:-5,minY:-6.1,maxY:-3.8,z:-4.15,radius:1.25},$={x:-8,topY:-2.6,bottomY:-5.4,z:-4.15,radius:1.5},T={fanPositions:[-6,0,6],fanZ:1.4,fanRadius:2.4,fanMinY:.8,fanMaxY:3.8,floorMoverZ:-.6,floorMoverMinY:-3,floorMoverMaxY:-1.8,clerestoryMinGap:.08},me=45;function o(t){return Number(t).toFixed(3)}function Qe(t,a){const s=Math.max(0,a);return{leftEndZ:t-s/2,rightStartZ:t+s/2}}function pe(t,a,s,c=0){const f=4+Math.tan(a*Math.PI/180)*2.3;if(t<=s){const d=de((t+4.6)/(s+4.6));return 4+(f-4)*d}const i=de((t-s)/(4.6-s));return f+c+(4-f)*i}function ee(t,a,s,c,f=U,i=N.z,d=1.5){if(i<=s||i>=c)return[{startX:t,endX:a,startZ:s,endZ:c}];const m=d/2,n=Math.max(s,i-m),p=Math.min(c,i+m),S=[{startX:t,endX:a,startZ:s,endZ:n},{startX:t,endX:a,startZ:p,endZ:c}],F=[...f].sort((P,x)=>P-x);let j=t;return F.forEach(P=>{const x=Math.max(t,P-m),v=Math.min(a,P+m);x>j&&S.push({startX:j,endX:x,startZ:n,endZ:p}),j=Math.max(j,v)}),j<a&&S.push({startX:j,endX:a,startZ:n,endZ:p}),S.filter(P=>P.endX>P.startX&&P.endZ>P.startZ)}function et(t){const a=[{key:"shaftExchange",label:"Shaft exchange",points:t.shaftExchange*32,description:"Passive lift through the three street shafts."},{key:"grooves",label:"Passive grooves",points:t.grooves*18,description:"Low-energy guidance along the roof grooves."},{key:"floodFlow",label:"Flood gallery",points:t.floodTunnels?t.floodFlow*22:0,description:"Cold-sink exchange through the lower gallery."}],s=[{key:"shaftFans",label:"Shaft fans",points:t.shaftFans?t.shaftFanVelocity/8*12:0,description:"Powered upward flow through the street shafts."},{key:"downFans",label:"Downward fans",points:t.downFans*8,description:"Powered ceiling fan transport."},{key:"floorAirMovers",label:"Floor air movers",points:t.floorAirMovers*8,description:"Powered platform-level transport."},{key:"ceilingFans",label:"Ceiling flow",points:t.ceilingFans*10,description:"Powered ceiling-band sweep."}],c=a.reduce((d,m)=>d+m.points,0),f=s.reduce((d,m)=>d+m.points,0),i=me+c-f;return{baseline:me,passive:a,active:s,passiveTotal:c,activeTotal:f,rawScore:i,score:Math.round(Math.max(0,Math.min(100,i)))}}function tt(t,a=r.baseY,s=r.landingY,c=r.baseY+r.riseY){if(t<=r.startX)return a;if(t<r.lowerFlightEndX){const f=(t-r.startX)/(r.lowerFlightEndX-r.startX);return a+f*(s-a)}if(t<=r.upperFlightStartX)return s;if(t<r.endX){const f=(t-r.upperFlightStartX)/(r.endX-r.upperFlightStartX);return s+f*(c-s)}return c}function at(t=r.landingY,a=r.baseY+r.riseY,s=r.tunnelHeight){const c=r.endX-r.upperFlightStartX,f=a-t,i=Math.atan2(f,c),d=(r.upperFlightStartX+r.endX)/2,m=t+f/2+s/2,n=s/2,S=(a-_.sidewalkThickness/2-m-n*Math.cos(i))/Math.sin(i);return d+S*Math.cos(i)-n*Math.sin(i)}function rt(t,a){return a<=0?!1:a>=1?!0:(t*.61803398875%1+1)%1<a}function ot(t,a,s,c=0,f=0){if(!s)return{active:!1,positionX:H.startX,velocityX:0};const i=Math.max(H.traversalSeconds+f,a),d=(t%i+i)%i,m=Math.floor(Math.max(0,t)/i),n=rt(m,c),p=H.traversalSeconds/2,S=n?f:0;if(d>H.traversalSeconds+S)return{active:!1,positionX:H.startX,velocityX:0};const F=H.endX-H.startX,j=F/H.traversalSeconds;if(n&&d>=p&&d<=p+S)return{active:!0,positionX:0,velocityX:0,stopped:!0};const P=n&&d>p?d-S:d;return{active:!0,positionX:H.startX+F*(P/H.traversalSeconds),velocityX:j,stopped:!1}}function de(t){return Math.max(0,Math.min(1,t))}const g={...$e,surfaceTemperature:81.5,roadSurfaceTemperature:92,ambientAirTemperature:72,passengerHeat:.75,surfaceCrosswind:3,stairUndergroundOpeningHeight:r.tunnelHeight,stairLandingHeight:r.landingY,stairSurfaceOpeningHeight:r.baseY+r.riseY,density:1.18,stiffness:5,viscosity:.012,constitutiveModel:"baseline",constitutiveStrength:1,constitutiveSpeedLimit:8,train:!0,ac:!0,brakes:!0,shaftExchange:.65,shaftControls:[1,1,1],shaftFans:!0,shaftFanVelocity:2.5,downFans:.45,floorAirMovers:.5,ceilingFans:.5,grooves:.7,floodTunnels:!0,floodFlow:.55,floodPumpDirection:1,roofPitch:14,roofOffset:0,roofGapHorizontal:0,roofGapVertical:0,clerestoryWindows:!0,clerestoryOpen:0,stackEffect:.65,trainInterval:20,trainStopFrequency:.5,trainStopDuration:6,particleCount:4096,particleDiameter:.7,particleMagnitudeScale:.6,windOcclusion:!0},Q=[(Y.minX+Y.maxX)/2,3,0],ne=Ge({target:Q,distance:61,frontDistance:72,frontDirection:-1,ortho1Offset:[41,35,48],ortho2Offset:[-41,35,-48]}),oe={breakpoint:700,width:306,right:28};function he(t,a,s,c,f){if(!f||c.width<=oe.breakpoint)return new B;const d=(oe.width+oe.right)/2,n=2*a.distanceTo(s)*Math.tan(Z.degToRad(t.fov)/2)*c.width/c.height;return s.clone().sub(a).normalize().cross(new B(0,1,0)).normalize().multiplyScalar(d*n/c.width)}const it=je.map(t=>`passengerInfluence = max(passengerInfluence, (1.0 - smoothstep(0.25, 1.6, length(particlePosition.xz - vec2(${o(t.x)}, ${o(t.z)})))) * (1.0 - smoothstep(0.4, 1.9, abs(particlePosition.y - ${o(t.y)}))));`).join(`
    `),st=`
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
        positionData.x - ${o(C.minX)},
        ${o(C.maxX-C.minX)}
      ) + ${o(C.minX)};
    } else {
      if (positionData.x < ${o(C.minX)}) positionData.x += ${o(C.maxX-C.minX)};
      if (positionData.x > ${o(C.maxX)}) positionData.x -= ${o(C.maxX-C.minX)};
    }
    positionData.y = clamp(positionData.y, ${o(C.minY)}, ${o(C.maxY)});
    if (positionData.y >= uStreetY) {
      positionData.z = mod(
        positionData.z - ${o(C.minZ)},
        ${o(C.maxZ-C.minZ)}
      ) + ${o(C.minZ)};
    } else {
      positionData.z = clamp(positionData.z, ${o(C.minZ)}, ${o(C.maxZ)});
    }
    if (!uFloodTunnels) positionData.y = max(positionData.y, ${o(R.maxY)});

    float trackGroundContact = step(${o(Y.minX)}, positionData.x)
      * step(positionData.x, ${o(Y.maxX)})
      * step(abs(positionData.z - ${o(Y.centerZ)}), ${o(Y.tunnelWidth/2)});
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
      * step(${o(C.minZ)}, positionData.z)
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

    float turnstileXContact = step(abs(positionData.x - ${o(E.x)}), ${o(E.halfDepth)});
    float turnstileYContact = step(${o(r.baseY)}, positionData.y)
      * step(positionData.y, ${o(r.baseY+E.pedestalHeight)});
    float turnstilePedestalContact = max(
      max(
        step(abs(positionData.z - ${o(E.pedestalZ[0])}), ${o(E.pedestalHalfWidth)}),
        step(abs(positionData.z - ${o(E.pedestalZ[1])}), ${o(E.pedestalHalfWidth)})
      ),
      max(
        step(abs(positionData.z - ${o(E.pedestalZ[2])}), ${o(E.pedestalHalfWidth)}),
        step(abs(positionData.z - ${o(E.pedestalZ[3])}), ${o(E.pedestalHalfWidth)})
      )
    );
    if (turnstileXContact * turnstileYContact * turnstilePedestalContact > 0.5) {
      positionData.x = ${o(E.x)} + (velocityData.x >= 0.0 ? -${o(E.halfDepth)} : ${o(E.halfDepth)});
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
      * (1.0 - smoothstep(0.0, 1.1, abs(positionData.z - ${o(N.z)})))
      * smoothstep(0.4, ${o(N.throatY)}, positionData.y);
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
`,nt=`
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
  uniform float uFluidModel;
  uniform float uConstitutiveStrength;
  uniform float uConstitutiveSpeedLimit;
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
      float surfaceSpan = ${o(C.maxZ-C.minZ)};
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
    float strainRate = length(particleVelocity) / max(uRadius, 0.05);
    float localViscosity = uViscosity;
    float thermalTransport = 1.0;
    if (uFluidModel > 0.5 && uFluidModel < 1.5) {
      float localTemperature = mix(60.0, 110.0, thermalIntensity);
      float temperatureFactor = exp(-0.02 * (localTemperature - 72.0));
      float shearFactor = pow(max(1.0, strainRate), -0.35 * uConstitutiveStrength);
      localViscosity *= temperatureFactor * shearFactor;
      thermalTransport = 1.45;
    } else if (uFluidModel > 1.5) {
      float beta = clamp(length(particleVelocity) / max(uConstitutiveSpeedLimit, 0.1), 0.0, 0.9999);
      float lorentzFactor = inversesqrt(1.0 - beta * beta);
      localViscosity *= 1.0 + uConstitutiveStrength * ((lorentzFactor - 1.0) + strainRate);
    }

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
          viscosityForce += localViscosity * (neighborVelocity - particleVelocity) * kernelWeight;
        }
      }
    }

    vec3 acceleration = pressureForce + viscosityForce + vec3(0.6 * (1.0 - surfaceParticle), 0.0, 0.0);
    float surfaceHeat = clamp((uSurfaceTemperature - 60.0) / 50.0, 0.0, 1.0);
    float surfaceBand = 1.0 - smoothstep(0.0, 2.1, abs(particlePosition.y + 2.4));
    float surfaceThermalDelta = surfaceHeat - 0.42;
    acceleration.y += surfaceThermalDelta * surfaceBand * 0.55;
    thermalIntensity = clamp(thermalIntensity + uDt * surfaceThermalDelta * surfaceBand * 0.25 * thermalTransport, 0.0, 1.0);
    float passengerInfluence = 0.0;
    ${it}
    if (surfaceParticle < 0.5) {
      acceleration.y += passengerInfluence * uPassengerHeat * 0.8;
      thermalIntensity = clamp(thermalIntensity + uDt * passengerInfluence * uPassengerHeat * 0.18, 0.0, 1.0);
    }
    float roadBand = surfaceParticle
      * step(uStreetY, particlePosition.y)
      * (1.0 - smoothstep(0.0, 2.4, particlePosition.y - uStreetY))
      * step(${o(A.minX)}, particlePosition.x)
      * step(particlePosition.x, ${o(A.maxX)})
      * step(${o(_.sidewalkRoadEdgeZ)}, particlePosition.z)
      * step(particlePosition.z, ${o(A.maxZ)});
    float roadThermalDelta = clamp((uRoadSurfaceTemperature - uAmbientAirTemperature) / 40.0, -1.0, 1.0);
    acceleration.y += roadThermalDelta * roadBand * 1.15;
    thermalIntensity = clamp(thermalIntensity + uDt * roadThermalDelta * roadBand * 0.35 * thermalTransport, 0.0, 1.0);
    float ambientBand = surfaceParticle * smoothstep(uStreetY + 0.8, uStreetY + 2.4, particlePosition.y);
    float ambientHeat = clamp((uAmbientAirTemperature - 60.0) / 50.0, 0.0, 1.0);
    acceleration.y += (ambientHeat - 0.42) * ambientBand * 0.1;
    thermalIntensity += (ambientHeat - thermalIntensity) * uDt * ambientBand * 0.12;
    float surfaceWindBand = smoothstep(uStreetY - 0.5, uStreetY + 0.5, particlePosition.y);
    float surfaceMixFraction = fract(positionData.w);
    float surfaceMixTargetY = mix(
      uSurfaceFloorY + ${o(re.minimumHeight)},
      ${o(C.maxY-re.ceilingMargin)},
      surfaceMixFraction
    );
    float surfaceShaftNorth = 1.0 - smoothstep(0.55, 1.4, abs(particlePosition.x + 7.0));
    float surfaceShaftCenter = 1.0 - smoothstep(0.55, 1.4, abs(particlePosition.x));
    float surfaceShaftSouth = 1.0 - smoothstep(0.55, 1.4, abs(particlePosition.x - 7.0));
    float surfaceShaftOutlet = max(surfaceShaftNorth, max(surfaceShaftCenter, surfaceShaftSouth))
      * (1.0 - smoothstep(0.45, 1.25, abs(particlePosition.z - ${o(N.z)})))
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
    float surfaceCeilingReturn = smoothstep(${o(C.maxY-1.5)}, ${o(C.maxY-.2)}, particlePosition.y);
    acceleration.y += surfaceFloorReturn * (0.9 + max(0.0, -particleVelocity.y) * 6.0);
    acceleration.y += abs(uSurfaceCrosswind) * surfaceShaftOutlet * surfaceShaftControl * 1.8;
    acceleration.y += surfaceParticle * abs(uSurfaceCrosswind)
      * (surfaceMixTargetY - particlePosition.y) * ${o(re.strength)} * surfaceWindBand
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
      * (1.0 - smoothstep(0.0, 1.3, abs(particlePosition.z - ${o(N.z)})))
      * smoothstep(0.4, 2.5, particlePosition.y)
      * shaftCaptureHeight;
    float shaftVerticalColumn = shaftInfluence
      * (1.0 - smoothstep(0.0, 0.9, abs(particlePosition.z - ${o(N.z)})))
      * smoothstep(0.4, ${o(N.throatY)}, particlePosition.y)
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
    float floodGalleryBand = (1.0 - smoothstep(0.0, ${o(R.radius)}, abs(particlePosition.z - ${o(R.z)})))
      * (1.0 - smoothstep(${o(R.minY)}, ${o(R.maxY)}, particlePosition.y));
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
      acceleration.z += (${o(N.z)} - particlePosition.z) * shaftVerticalColumn * 4.4;
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
      float waterfallRadial = length(vec2(particlePosition.x - ${o($.x)}, particlePosition.z - ${o($.z)}));
      float waterfallBand = (1.0 - smoothstep(${o($.radius*.5)}, ${o($.radius)}, waterfallRadial))
        * smoothstep(${o($.bottomY)}, ${o($.bottomY+.4)}, particlePosition.y)
        * (1.0 - smoothstep(${o($.topY-.4)}, ${o($.topY)}, particlePosition.y));
      acceleration.y -= uFloodFlow * floodBand * floodCaptureBand * 0.8;
      acceleration.y -= uFloodFlow * waterfallBand * 2.4;
      acceleration.z += (${o(R.z)} - particlePosition.z) * uFloodFlow * floodCaptureBand * 0.45;
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
`,lt=`
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
`,ct=`
  uniform float uParticleOpacity;
  uniform vec3 uCoolColor;
  uniform vec3 uWarmColor;
  uniform vec3 uHotColor;
  varying float vThermal;

  void main() {
    vec3 color = vThermal < 0.5
      ? mix(uCoolColor, uWarmColor, vThermal * 2.0)
      : mix(uWarmColor, uHotColor, (vThermal - 0.5) * 2.0);
    gl_FragColor = vec4(color, 0.76 * uParticleOpacity);
  }
`;function ut({settings:t,trainRef:a,onTelemetry:s,onGpuError:c}){const{gl:f}=ge(),i=b.useRef(null),d=b.useRef(null),m=b.useRef(null),n=b.useRef(t),p=b.useRef(s),S=b.useRef(0),F=b.useRef({position:null,velocity:null}),j=b.useRef(81.5);n.current=t,p.current=s;const P=t.particleCount,x=Math.ceil(Math.sqrt(P)),v=b.useMemo(()=>{const y=new Ce(.5,10,8);return y.setAttribute("aSimulationUv",new Fe(De(x,P),2)),y},[P,x]),w=b.useMemo(()=>new Me({uniforms:{uPositionTex:{value:null},uVelocityTex:{value:null},uParticleDiameter:{value:g.particleDiameter},uParticleMagnitudeScale:{value:g.particleMagnitudeScale},uParticleOpacity:{value:g.particleAppearance.opacity},uCoolColor:{value:new ae("#3a9bb4")},uWarmColor:{value:new ae("#f0a23a")},uHotColor:{value:new ae("#f45b4f")}},vertexShader:lt,fragmentShader:ct,transparent:!0,depthWrite:!1,blending:Ye}),[P]);return b.useEffect(()=>{let y;try{const D=L(n.current.stairSurfaceOpeningHeight),u=Oe({gl:f,resolution:x,positionShader:st,velocityShader:nt,initialize:({particleIndex:h,positionData:G,velocityData:O,offset:k})=>{const z=h%ie===0;G[k]=Z.lerp(C.minX,C.maxX,Math.random()),G[k+1]=z?_e(h,P,D.streetY):Z.lerp(fe.minY,fe.maxY,Math.random()),G[k+2]=Z.lerp(C.minZ,C.maxZ,Math.random()),G[k+3]=z?2+Se(h,P)*.999:1,O[k]=0,O[k+1]=0,O[k+2]=0,O[k+3]=0}});y=u.gpuCompute;const{positionVariable:X,velocityVariable:l}=u;X.material.uniforms.uDt={value:.016},X.material.uniforms.uRoofPitch={value:Z.degToRad(g.roofPitch)},X.material.uniforms.uRoofOffset={value:g.roofOffset},X.material.uniforms.uRoofGapHorizontal={value:g.roofGapHorizontal},X.material.uniforms.uRoofGapVertical={value:g.roofGapVertical},X.material.uniforms.uStairTunnelHeight={value:g.stairUndergroundOpeningHeight},X.material.uniforms.uStairLandingY={value:g.stairLandingHeight},X.material.uniforms.uStairSurfaceY={value:g.stairSurfaceOpeningHeight},X.material.uniforms.uStreetY={value:L(g.stairSurfaceOpeningHeight).streetY},X.material.uniforms.uSurfaceFloorY={value:L(g.stairSurfaceOpeningHeight).surfaceParticleFloorY},X.material.uniforms.uClerestoryOpen={value:g.clerestoryOpen},X.material.uniforms.uClerestoryWindows={value:g.clerestoryWindows},X.material.uniforms.uFloodTunnels={value:g.floodTunnels},l.material.uniforms.uDt={value:.016},l.material.uniforms.uSurfaceTemperature={value:g.surfaceTemperature},l.material.uniforms.uRoadSurfaceTemperature={value:g.roadSurfaceTemperature},l.material.uniforms.uAmbientAirTemperature={value:g.ambientAirTemperature},l.material.uniforms.uPassengerHeat={value:g.passengerHeat},l.material.uniforms.uSurfaceCrosswind={value:g.surfaceCrosswind},l.material.uniforms.uRadius={value:.85},l.material.uniforms.uRestDensity={value:g.density},l.material.uniforms.uStiffness={value:g.stiffness},l.material.uniforms.uViscosity={value:g.viscosity},l.material.uniforms.uFluidModel={value:ue(g.constitutiveModel)},l.material.uniforms.uConstitutiveStrength={value:g.constitutiveStrength},l.material.uniforms.uConstitutiveSpeedLimit={value:g.constitutiveSpeedLimit},l.material.uniforms.uTrainPosX={value:0},l.material.uniforms.uTrainVelX={value:0},l.material.uniforms.uShaftExchange={value:g.shaftExchange},l.material.uniforms.uShaftControls={value:new B(...g.shaftControls)},l.material.uniforms.uShaftFanVelocity={value:g.shaftFanVelocity},l.material.uniforms.uDownFans={value:g.downFans},l.material.uniforms.uFloorAirMovers={value:g.floorAirMovers},l.material.uniforms.uCeilingFans={value:g.ceilingFans},l.material.uniforms.uGrooves={value:g.grooves},l.material.uniforms.uFloodFlow={value:g.floodFlow},l.material.uniforms.uFloodPumpDirection={value:g.floodPumpDirection},l.material.uniforms.uRoofPitch={value:Z.degToRad(g.roofPitch)},l.material.uniforms.uRoofOffset={value:g.roofOffset},l.material.uniforms.uRoofGapHorizontal={value:g.roofGapHorizontal},l.material.uniforms.uRoofGapVertical={value:g.roofGapVertical},l.material.uniforms.uClerestoryOpen={value:g.clerestoryOpen},l.material.uniforms.uClerestoryWindows={value:g.clerestoryWindows},l.material.uniforms.uStackEffect={value:g.stackEffect},l.material.uniforms.uStairTunnelHeight={value:g.stairUndergroundOpeningHeight},l.material.uniforms.uStairLandingY={value:g.stairLandingHeight},l.material.uniforms.uStairSurfaceY={value:g.stairSurfaceOpeningHeight},l.material.uniforms.uStreetY={value:L(g.stairSurfaceOpeningHeight).streetY},l.material.uniforms.uStreetMaxY={value:L(g.stairSurfaceOpeningHeight).streetMaxY},l.material.uniforms.uSurfaceFloorY={value:L(g.stairSurfaceOpeningHeight).surfaceParticleFloorY},l.material.uniforms.uShaftOutletY={value:L(g.stairSurfaceOpeningHeight).shaftOutletY},l.material.uniforms.uTrainActive={value:!0},l.material.uniforms.uShaftFans={value:g.shaftFans},l.material.uniforms.uAcActive={value:!0},l.material.uniforms.uBrakesActive={value:!0},l.material.uniforms.uFloodTunnels={value:!0},l.material.uniforms.uWindOcclusion={value:g.windOcclusion};const I=y.init();if(I)throw new Error(I);i.current=y,d.current=X,m.current=l}catch(D){c(D instanceof Error?D.message:"GPU simulation could not initialize.")}return()=>{i.current=null,d.current=null,m.current=null,y?.dispose(),v.dispose(),w.dispose()}},[f,c,v,w]),J((y,D)=>{const u=i.current,X=d.current,l=m.current;if(!u||!X||!l)return;const I=Math.min(D,.033),h=n.current,G=L(h.stairSurfaceOpeningHeight),O=ot(y.clock.elapsedTime,h.trainInterval,h.train,h.trainStopFrequency,h.trainStopDuration);a.current&&(a.current.position.x=O.positionX,a.current.visible=O.active),X.material.uniforms.uDt.value=I,X.material.uniforms.uRoofPitch.value=Z.degToRad(h.roofPitch),X.material.uniforms.uRoofOffset.value=h.roofOffset,X.material.uniforms.uRoofGapHorizontal.value=h.roofGapHorizontal,X.material.uniforms.uRoofGapVertical.value=h.roofGapVertical,X.material.uniforms.uStairTunnelHeight.value=h.stairUndergroundOpeningHeight,X.material.uniforms.uStairLandingY.value=h.stairLandingHeight,X.material.uniforms.uStairSurfaceY.value=h.stairSurfaceOpeningHeight,X.material.uniforms.uStreetY.value=G.streetY,X.material.uniforms.uSurfaceFloorY.value=G.surfaceParticleFloorY,X.material.uniforms.uClerestoryOpen.value=h.clerestoryOpen,X.material.uniforms.uClerestoryWindows.value=h.clerestoryWindows,X.material.uniforms.uFloodTunnels.value=h.floodTunnels,l.material.uniforms.uDt.value=I,l.material.uniforms.uSurfaceTemperature.value=h.surfaceTemperature,l.material.uniforms.uRoadSurfaceTemperature.value=h.roadSurfaceTemperature,l.material.uniforms.uAmbientAirTemperature.value=h.ambientAirTemperature,l.material.uniforms.uPassengerHeat.value=h.passengerHeat,l.material.uniforms.uSurfaceCrosswind.value=h.surfaceCrosswind,l.material.uniforms.uRestDensity.value=h.density,l.material.uniforms.uStiffness.value=h.stiffness,l.material.uniforms.uViscosity.value=h.viscosity,l.material.uniforms.uFluidModel.value=ue(h.constitutiveModel),l.material.uniforms.uConstitutiveStrength.value=h.constitutiveStrength,l.material.uniforms.uConstitutiveSpeedLimit.value=h.constitutiveSpeedLimit,l.material.uniforms.uTrainPosX.value=O.positionX,l.material.uniforms.uTrainVelX.value=O.velocityX,l.material.uniforms.uShaftExchange.value=h.shaftExchange,l.material.uniforms.uShaftControls.value.fromArray(h.shaftControls),l.material.uniforms.uShaftFanVelocity.value=h.shaftFanVelocity,l.material.uniforms.uDownFans.value=h.downFans,l.material.uniforms.uFloorAirMovers.value=h.floorAirMovers,l.material.uniforms.uCeilingFans.value=h.ceilingFans,l.material.uniforms.uGrooves.value=h.grooves,l.material.uniforms.uFloodFlow.value=h.floodFlow,l.material.uniforms.uFloodPumpDirection.value=h.floodPumpDirection,l.material.uniforms.uRoofPitch.value=Z.degToRad(h.roofPitch),l.material.uniforms.uRoofOffset.value=h.roofOffset,l.material.uniforms.uRoofGapHorizontal.value=h.roofGapHorizontal,l.material.uniforms.uRoofGapVertical.value=h.roofGapVertical,l.material.uniforms.uClerestoryOpen.value=h.clerestoryOpen,l.material.uniforms.uClerestoryWindows.value=h.clerestoryWindows,l.material.uniforms.uStackEffect.value=h.stackEffect,l.material.uniforms.uStairTunnelHeight.value=h.stairUndergroundOpeningHeight,l.material.uniforms.uStairLandingY.value=h.stairLandingHeight,l.material.uniforms.uStairSurfaceY.value=h.stairSurfaceOpeningHeight,l.material.uniforms.uStreetY.value=G.streetY,l.material.uniforms.uStreetMaxY.value=G.streetMaxY,l.material.uniforms.uSurfaceFloorY.value=G.surfaceParticleFloorY,l.material.uniforms.uShaftOutletY.value=G.shaftOutletY,l.material.uniforms.uTrainActive.value=O.active,l.material.uniforms.uShaftFans.value=h.shaftFans,l.material.uniforms.uAcActive.value=h.ac&&O.active,l.material.uniforms.uBrakesActive.value=h.brakes&&O.active,l.material.uniforms.uFloodTunnels.value=h.floodTunnels,l.material.uniforms.uWindOcclusion.value=h.windOcclusion,u.compute();const k=u.getCurrentRenderTarget(X),z=u.getCurrentRenderTarget(l);if(w.uniforms.uPositionTex.value=k.texture,w.uniforms.uVelocityTex.value=z.texture,w.uniforms.uParticleDiameter.value=h.particleDiameter,w.uniforms.uParticleMagnitudeScale.value=h.particleMagnitudeScale,w.uniforms.uParticleOpacity.value=h.particleAppearance.opacity,S.current+=I,S.current>.4){let V=h.ambientAirTemperature;V+=(h.roadSurfaceTemperature-h.ambientAirTemperature)*.22,V+=h.passengerHeat*1.4,h.ac&&(V+=4.5),h.brakes&&O.active&&Math.abs(O.positionX)<2&&(V+=3.2),O.active&&(V-=2),j.current+=(V-j.current)*.05+(Math.random()-.5)*.35;const te=x*x*4;F.current.position?.length!==te&&(F.current={position:new Float32Array(te),velocity:new Float32Array(te)}),f.readRenderTargetPixels(k,0,0,x,x,F.current.position),f.readRenderTargetPixels(z,0,0,x,x,F.current.velocity),p.current({temperature:j.current,shafts:qe(F.current.position,F.current.velocity,P,G.streetY)}),S.current=0}}),e.jsx("instancedMesh",{args:[v,w,P],frustumCulled:!1})}const ft=b.forwardRef(function({active:a,brakes:s},c){const f=b.useRef(),i=[b.useRef(),b.useRef()],d=[b.useRef(),b.useRef()];return J(()=>{i.forEach(n=>{a&&(n.current.rotation.y+=.3)});const m=s&&c.current&&Math.abs(c.current.position.x)<2;f.current&&(f.current.position.y=m?-1.8+(Math.random()-.5)*.04:-1.8),d.forEach(n=>{n.current.intensity=m?4+Math.random()*5:0})}),e.jsxs("group",{ref:c,children:[e.jsxs("mesh",{ref:f,position:[0,-1.8,2.5],castShadow:!0,children:[e.jsx("boxGeometry",{args:[16,3.4,2.8]}),e.jsx("meshStandardMaterial",{color:"#b7c7c5",metalness:.82,roughness:.25})]}),[1.06,3.94].map(m=>e.jsxs("group",{children:[[-6.2,-1.7,1.7,6.2].map(n=>e.jsxs("mesh",{position:[n,-1.5,m],children:[e.jsx("boxGeometry",{args:[1.55,1.1,.05]}),e.jsx("meshStandardMaterial",{color:"#17333a",metalness:.4,roughness:.18,emissive:"#0d6872",emissiveIntensity:.35})]},n)),[-4,4].map(n=>e.jsxs("group",{position:[n,-1.8,m],children:[[-.59,.59].map(p=>e.jsxs("group",{position:[p,0,0],children:[e.jsxs("mesh",{children:[e.jsx("boxGeometry",{args:[1.14,2.75,.06]}),e.jsx("meshStandardMaterial",{color:"#8fa3a2",metalness:.75,roughness:.3})]}),e.jsxs("mesh",{position:[0,.55,m<2.5?-.04:.04],children:[e.jsx("boxGeometry",{args:[.78,.88,.035]}),e.jsx("meshStandardMaterial",{color:"#17333a",metalness:.4,roughness:.18,emissive:"#0d6872",emissiveIntensity:.3})]})]},p)),e.jsxs("mesh",{position:[0,0,m<2.5?-.04:.04],children:[e.jsx("boxGeometry",{args:[.045,2.75,.035]}),e.jsx("meshStandardMaterial",{color:"#263638",metalness:.55,roughness:.4})]})]},n))]},m)),[-4,4].map((m,n)=>e.jsxs("group",{children:[e.jsxs("mesh",{position:[m,.1,2.5],children:[e.jsx("boxGeometry",{args:[2.5,.4,1.8]}),e.jsx("meshStandardMaterial",{color:"#33484b",roughness:.8})]}),e.jsxs("mesh",{ref:i[n],position:[m,.35,2.5],children:[e.jsx("boxGeometry",{args:[1.4,.05,.2]}),e.jsx("meshStandardMaterial",{color:"#192427",roughness:.8})]})]},m)),[-6,6].map((m,n)=>e.jsx("pointLight",{ref:d[n],color:"#ff493d",distance:7,position:[m,-3,3.5]},m))]})}),mt=[-2.4,-.8,.8,2.4];function pt({settings:t}){const a=b.useRef([]),s=b.useRef([]),c=b.useRef([]),f=Z.degToRad(t.roofPitch),i=t.roofOffset,d=4+Math.tan(f)*2.3,m=Math.max(0,t.roofGapHorizontal),n=Math.max(.05,t.roofGapVertical),{streetY:p}=L(t.stairSurfaceOpeningHeight),{leftEndZ:S,rightStartZ:F}=Qe(i,m),j=[...ee(-11,11,-4.6,S),...ee(-11,11,F,4.6)].map(v=>{const w=pe(v.startZ,t.roofPitch,i,n),y=pe(v.endZ,t.roofPitch,i,n);return{...v,centerX:(v.startX+v.endX)/2,centerY:(w+y)/2,centerZ:(v.startZ+v.endZ)/2,length:Math.hypot(v.endZ-v.startZ,y-w),rotation:Math.atan2(-(y-w),v.endZ-v.startZ)}}),P=Math.hypot(m,n),x=-Math.atan2(n,m);return J((v,w)=>{a.current.forEach(y=>{y&&(y.rotation.x+=w*(2+t.ceilingFans*5))}),s.current.forEach(y=>{y&&(y.rotation.x+=w*(1.5+t.floorAirMovers*6))}),c.current.forEach((y,D)=>{y&&t.shaftFans&&(y.rotation.y+=w*t.shaftFanVelocity*t.shaftControls[D]*5)})}),e.jsxs("group",{children:[e.jsx("group",{children:U.map((v,w)=>e.jsxs("group",{position:[v,0,-1.4],children:[e.jsxs("mesh",{position:[0,(N.throatY+p)/2,0],children:[e.jsx("boxGeometry",{args:[1.25,p-N.throatY,1.25]}),e.jsx("meshStandardMaterial",{color:"#708b82",metalness:.45,roughness:.55,transparent:!0,opacity:.18,depthWrite:!1})]}),e.jsxs("mesh",{position:[0,p,0],children:[e.jsx("boxGeometry",{args:[1.5,.12,1.5]}),e.jsx("meshStandardMaterial",{color:"#d5b75e",metalness:.7,roughness:.3,transparent:!0,opacity:.65})]}),[-.48,-.24,0,.24,.48].map(y=>e.jsxs("mesh",{position:[0,p+.08,y],children:[e.jsx("boxGeometry",{args:[1.2,.06,.1]}),e.jsx("meshStandardMaterial",{color:"#203b3d",metalness:.78,roughness:.28})]},y)),e.jsxs("mesh",{position:[0,N.throatY,0],children:[e.jsx("boxGeometry",{args:[1.05,.08,1.05]}),e.jsx("meshStandardMaterial",{color:"#1d3536",metalness:.35,roughness:.45})]}),e.jsxs("group",{ref:y=>{c.current[w]=y},position:[0,N.throatY+.14,0],children:[e.jsxs("mesh",{children:[e.jsx("cylinderGeometry",{args:[.46,.46,.08,16]}),e.jsx("meshStandardMaterial",{color:t.shaftFans?"#63b6b1":"#49615e",metalness:.55,roughness:.3})]}),e.jsxs("mesh",{position:[0,.06,0],children:[e.jsx("boxGeometry",{args:[.86,.035,.08]}),e.jsx("meshBasicMaterial",{color:t.shaftFans?"#bce8d5":"#708b82"})]}),e.jsxs("mesh",{position:[0,.06,0],rotation:[0,Math.PI/2,0],children:[e.jsx("boxGeometry",{args:[.86,.035,.08]}),e.jsx("meshBasicMaterial",{color:t.shaftFans?"#bce8d5":"#708b82"})]})]})]},v))}),e.jsx("group",{children:[-6,0,6].map((v,w)=>e.jsxs("group",{ref:y=>{a.current[w]=y},position:[v,3.48,1.4],rotation:[0,0,Math.PI/2],children:[e.jsxs("mesh",{children:[e.jsx("cylinderGeometry",{args:[.42,.42,.14,16]}),e.jsx("meshStandardMaterial",{color:"#63b6b1",emissive:"#165d61",emissiveIntensity:.3,metalness:.55,roughness:.3})]}),e.jsxs("mesh",{position:[0,.05,0],children:[e.jsx("boxGeometry",{args:[.75,.035,.06]}),e.jsx("meshBasicMaterial",{color:"#bce8d5"})]}),e.jsxs("mesh",{position:[0,.05,0],rotation:[0,Math.PI/2,0],children:[e.jsx("boxGeometry",{args:[.75,.035,.06]}),e.jsx("meshBasicMaterial",{color:"#bce8d5"})]})]},v))}),e.jsx("group",{children:T.fanPositions.map((v,w)=>e.jsxs("group",{ref:y=>{s.current[w]=y},position:[v,-2.34,T.floorMoverZ],rotation:[0,0,Math.PI/2],children:[e.jsxs("mesh",{children:[e.jsx("cylinderGeometry",{args:[.42,.42,.14,16]}),e.jsx("meshStandardMaterial",{color:"#d5b75e",emissive:"#7a5421",emissiveIntensity:.35,metalness:.65,roughness:.3})]}),e.jsxs("mesh",{position:[0,.05,0],children:[e.jsx("boxGeometry",{args:[.72,.035,.06]}),e.jsx("meshBasicMaterial",{color:"#f0d38a"})]}),e.jsxs("mesh",{position:[0,.05,0],rotation:[0,Math.PI/2,0],children:[e.jsx("boxGeometry",{args:[.72,.035,.06]}),e.jsx("meshBasicMaterial",{color:"#f0d38a"})]})]},v))}),e.jsx("group",{children:mt.map((v,w)=>e.jsxs("mesh",{position:[0,3.95,v],rotation:[0,0,w%2?-.018:.018],children:[e.jsx("boxGeometry",{args:[20,.07,.12]}),e.jsx("meshStandardMaterial",{color:"#254546",emissive:"#1d5d58",emissiveIntensity:.25,roughness:.72})]},v))}),e.jsxs("group",{children:[j.map(v=>e.jsxs("mesh",{position:[v.centerX,v.centerY,v.centerZ],rotation:[v.rotation,0,0],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[v.endX-v.startX,.22,Math.max(.2,v.length)]}),e.jsx("meshStandardMaterial",{color:"#607974",roughness:.78,metalness:.18})]},`${v.startX}:${v.endX}:${v.startZ}:${v.endZ}`)),e.jsx("group",{visible:t.clerestoryWindows,position:[0,d+n/2,i],children:Array.from({length:10},(v,w)=>e.jsxs("mesh",{position:[-9+w*2,0,0],rotation:[x,0,0],children:[e.jsx("boxGeometry",{args:[1.7,.08,P]}),e.jsx("meshStandardMaterial",{color:"#9bdfe1",emissive:"#2f8e83",emissiveIntensity:.2+t.clerestoryOpen*.7,transparent:!0,opacity:.18+t.clerestoryOpen*.42,metalness:.18,roughness:.25})]},w))}),e.jsxs("mesh",{position:[9.65,4.1,0],children:[e.jsx("boxGeometry",{args:[.12,.45,5.8]}),e.jsx("meshBasicMaterial",{color:"#9bd1aa"})]})]})]})}function xe(t,a,s,c){const f=new le;f.moveTo(t[0].startX,t[0].startY+a),t.forEach(d=>f.lineTo(d.endX,d.endY+a)),f.lineTo(t.at(-1).endX,t.at(-1).endY+s),[...t].reverse().forEach(d=>f.lineTo(d.startX,d.startY+s)),f.closePath();const i=c==null?new Re(f):new ce(f,{depth:c,bevelEnabled:!1});return c!=null&&i.translate(0,0,r.z-c/2),i}function dt(t,a){const s=new le;s.moveTo(t[0].startX,a),s.lineTo(t.at(-1).endX,a),s.lineTo(t.at(-1).endX,t.at(-1).endY-.2),[...t].reverse().forEach(f=>s.lineTo(f.startX,f.startY-.2)),s.closePath();const c=new ce(s,{depth:r.width,bevelEnabled:!1});return c.translate(0,0,r.z-r.width/2),c}function ht(t,a,s){const c=new le;c.moveTo(r.landingStartX,r.baseY),c.lineTo(r.endX,r.baseY),c.lineTo(r.endX,s+t),c.lineTo(r.upperFlightStartX,a+t),c.lineTo(r.lowerFlightEndX,a+t),c.lineTo(r.startX,r.baseY+t),c.lineTo(r.landingStartX,r.baseY+t),c.closePath();const f=q.stairOuterZ-C.minZ,i=new ce(c,{depth:f,bevelEnabled:!1});return i.translate(0,0,C.minZ),i}function xt({tunnelHeight:t,landingY:a,surfaceY:s}){const c=Y.maxX-Y.minX,f=(Y.minX+Y.maxX)/2,i=Y.bedY-.2-C.minY,d=r.endX-r.landingStartX,m=(r.endX+r.landingStartX)/2,n=r.baseY-.2-C.minY,p=b.useMemo(()=>ht(t,a,s),[t,a,s]);return b.useEffect(()=>()=>p.dispose(),[p]),e.jsxs("group",{children:[e.jsxs("mesh",{position:[f,C.minY+i/2,Y.centerZ],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[c,i,Y.tunnelWidth]}),e.jsx("meshStandardMaterial",{color:"#33403f",roughness:.98})]}),e.jsxs("mesh",{position:[m,C.minY+n/2,r.z],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[d,n,r.width]}),e.jsx("meshStandardMaterial",{color:"#46514e",roughness:.98})]}),e.jsx("mesh",{geometry:p,receiveShadow:!0,children:e.jsx("meshStandardMaterial",{color:"#596763",transparent:!0,opacity:.09,depthWrite:!1,side:K,roughness:.95})})]})}function vt({tunnelHeight:t,landingY:a,surfaceY:s}){const c=r.startX-r.landingStartX,f=(r.landingStartX+r.startX)/2,i=[{id:"lower",startX:r.startX,endX:r.lowerFlightEndX,startY:r.baseY,endY:a},{id:"landing",startX:r.lowerFlightEndX,endX:r.upperFlightStartX,startY:a,endY:a},{id:"upper",startX:r.upperFlightStartX,endX:r.endX,startY:a,endY:s}].map(n=>({...n,centerX:(n.startX+n.endX)/2,centerY:(n.startY+n.endY)/2,length:Math.hypot(n.endX-n.startX,n.endY-n.startY),angle:Math.atan2(n.endY-n.startY,n.endX-n.startX)})),d=b.useMemo(()=>({underfill:dt(i,r.baseY-.2),wall:xe(i,0,t),ceiling:xe(i,t-.04,t+.04,r.width)}),[a,s,t]);b.useEffect(()=>()=>Object.values(d).forEach(n=>n.dispose()),[d]);const m={color:"#9bd1c1",emissive:"#2f8e83",emissiveIntensity:.18,transparent:!0,opacity:.11,depthWrite:!1,side:K};return e.jsxs("group",{children:[e.jsx("mesh",{geometry:d.underfill,receiveShadow:!0,children:e.jsx("meshStandardMaterial",{color:"#596763",transparent:!0,opacity:.09,depthWrite:!1,side:K,roughness:.95})}),e.jsxs("mesh",{position:[f,r.baseY+t,r.z],children:[e.jsx("boxGeometry",{args:[c,.08,r.width]}),e.jsx("meshStandardMaterial",{...m})]}),[-1,1].map(n=>e.jsxs("mesh",{position:[f,r.baseY+t/2,r.z+n*r.width/2],children:[e.jsx("boxGeometry",{args:[c,t,.08]}),e.jsx("meshStandardMaterial",{...m})]},`entry-${n}`)),e.jsx("mesh",{geometry:d.ceiling,children:e.jsx("meshStandardMaterial",{...m})}),[-1,1].map(n=>e.jsx("mesh",{geometry:d.wall,position:[0,0,r.z+n*r.width/2],children:e.jsx("meshStandardMaterial",{...m})},n))]})}function yt(){return e.jsx("group",{children:E.pedestalZ.map(t=>e.jsxs("group",{position:[E.x,r.baseY,t],children:[e.jsxs("mesh",{position:[0,E.pedestalHeight/2,0],castShadow:!0,receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[E.halfDepth*2,E.pedestalHeight,E.pedestalHalfWidth*2]}),e.jsx("meshStandardMaterial",{color:"#324b50",metalness:.72,roughness:.3})]}),e.jsxs("mesh",{position:[0,E.pedestalHeight+.05,0],children:[e.jsx("boxGeometry",{args:[.48,.12,.32]}),e.jsx("meshStandardMaterial",{color:"#79c9bb",emissive:"#1d706b",emissiveIntensity:.45,metalness:.45,roughness:.28})]}),e.jsx("group",{position:[.28,.72,0],rotation:[Math.PI/2,0,0],children:[0,Math.PI*2/3,Math.PI*4/3].map(a=>e.jsxs("mesh",{position:[Math.cos(a)*.3,Math.sin(a)*.3,0],rotation:[0,0,a],children:[e.jsx("boxGeometry",{args:[.62,.055,.055]}),e.jsx("meshStandardMaterial",{color:"#c8d5cf",metalness:.9,roughness:.18})]},a))})]},t))})}function gt({tunnelHeight:t,landingY:a,surfaceY:s}){const{streetY:c}=L(s),f=A.maxX-A.minX,i=(A.minX+A.maxX)/2,d=at(a,s,t),m=ee(A.minX,d,A.minZ,_.sidewalkRoadEdgeZ,U,N.z,_.shaftApertureSize),n=_.sidewalkRoadEdgeZ,p=A.maxZ-n,S=(n+A.maxZ)/2,F=4.8,j=c-F,P=ee(-11,9,A.minZ,A.maxZ);return e.jsxs("group",{children:[P.map(x=>e.jsxs("mesh",{position:[(x.startX+x.endX)/2,F+j/2,(x.startZ+x.endZ)/2],children:[e.jsx("boxGeometry",{args:[x.endX-x.startX,j,x.endZ-x.startZ]}),e.jsx("meshStandardMaterial",{color:"#596763",transparent:!0,opacity:.07,depthWrite:!1,side:K,roughness:.95})]},`insulation:${x.startX}:${x.endX}:${x.startZ}:${x.endZ}`)),e.jsxs("mesh",{position:[i,c-.09,S],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[f,.18,p]}),e.jsx("meshStandardMaterial",{color:"#273238",roughness:.96,metalness:.02})]}),m.map(x=>e.jsxs("mesh",{position:[(x.startX+x.endX)/2,c,(x.startZ+x.endZ)/2],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[x.endX-x.startX,.2,x.endZ-x.startZ]}),e.jsx("meshStandardMaterial",{color:"#7d8582",roughness:.88,metalness:.04})]},`${x.startX}:${x.endX}:${x.startZ}:${x.endZ}`)),e.jsxs("mesh",{position:[i,c+.08,n+.07],children:[e.jsx("boxGeometry",{args:[f,.24,.14]}),e.jsx("meshStandardMaterial",{color:"#c4c8bd",roughness:.78})]}),[0,4.2].map(x=>e.jsxs("mesh",{position:[i,c+.015,x],children:[e.jsx("boxGeometry",{args:[f-1,.025,.1]}),e.jsx("meshBasicMaterial",{color:"#eef0df"})]},x)),Array.from({length:14},(x,v)=>e.jsxs("mesh",{position:[A.minX+2+v*3.4,c+.02,1.8],children:[e.jsx("boxGeometry",{args:[1.8,.03,.12]}),e.jsx("meshBasicMaterial",{color:"#e8b941"})]},v))]})}function St({enabled:t,flow:a,pumpDirection:s}){const c=b.useRef([]),f=b.useRef([]),i=R.maxX-R.minX,d=(R.minX+R.maxX)/2;return J((m,n)=>{!t||a<=0||(c.current.forEach(p=>{p&&(p.position.x+=n*s*(1.5+a*5),p.position.x>R.maxX&&(p.position.x=R.minX),p.position.x<R.minX&&(p.position.x=R.maxX))}),f.current.forEach(p=>{p&&(p.position.y-=n*(1.5+a*4),p.position.y<$.bottomY&&(p.position.y=$.topY))}))}),e.jsxs("group",{visible:t,children:[e.jsxs("mesh",{position:[d,R.y,R.z],rotation:[0,0,Math.PI/2],children:[e.jsx("cylinderGeometry",{args:[R.radius,R.radius,i,24,1,!0]}),e.jsx("meshStandardMaterial",{color:"#15383e",side:Xe,roughness:.9,metalness:.1,transparent:!0,opacity:.82})]}),e.jsxs("mesh",{position:[d,-6.08,R.z],children:[e.jsx("boxGeometry",{args:[i-.5,.05,1.6]}),e.jsx("meshStandardMaterial",{color:"#21727a",emissive:"#0c4249",emissiveIntensity:.35+a*.45,roughness:.25,metalness:.12})]}),[R.minX,R.maxX].map(m=>e.jsxs("mesh",{position:[m,-5,-4.15],rotation:[0,Math.PI/2,0],children:[e.jsx("torusGeometry",{args:[1.25,.1,12,28]}),e.jsx("meshStandardMaterial",{color:"#d5b75e",metalness:.7,roughness:.34})]},m)),e.jsxs("mesh",{position:[d,-5.72,R.z],rotation:[0,s<0?Math.PI:0,0],children:[e.jsx("boxGeometry",{args:[4.5,.08,.1]}),e.jsx("meshBasicMaterial",{color:"#9bd1aa"})]}),e.jsx("group",{visible:a>0,children:Array.from({length:18},(m,n)=>e.jsxs("mesh",{ref:p=>{c.current[n]=p},position:[R.minX+(n+.5)*i/18,-5.35,R.z],children:[e.jsx("sphereGeometry",{args:[.09+a*.06,8,6]}),e.jsx("meshBasicMaterial",{color:"#77e6e8",transparent:!0,opacity:.45+a*.5})]},n))}),e.jsx("pointLight",{color:"#48cbd1",intensity:.4+a*1.4,distance:7,position:[0,-5.2,-4.15]}),e.jsxs("group",{visible:a>0,children:[e.jsxs("mesh",{position:[$.x,($.topY+$.bottomY)/2,$.z],children:[e.jsx("boxGeometry",{args:[1.35,$.topY-$.bottomY,.06]}),e.jsx("meshStandardMaterial",{color:"#68d9e1",emissive:"#167782",emissiveIntensity:.7+a,transparent:!0,opacity:.12+a*.28,roughness:.18})]}),Array.from({length:12},(m,n)=>e.jsxs("mesh",{ref:p=>{f.current[n]=p},position:[$.x-.55+n%4*.36,$.topY-n%6*.45,$.z+.04],children:[e.jsx("sphereGeometry",{args:[.07+a*.04,7,5]}),e.jsx("meshBasicMaterial",{color:"#a4f4f0",transparent:!0,opacity:.55+a*.4})]},n)),e.jsx("pointLight",{color:"#55dce2",intensity:.5+a*1.8,distance:6,position:[$.x,-4,$.z]})]})]})}function bt({landingY:t,surfaceY:a}){const s=e.jsx("meshStandardMaterial",{color:"#52646a",roughness:.88}),c=Y.maxX-Y.minX,f=(Y.minX+Y.maxX)/2,i=Y.bedY+Y.tunnelHeight/2,d=[{startX:r.startX,endX:r.lowerFlightEndX,startY:r.baseY,endY:t,count:r.lowerStepCount},{startX:r.upperFlightStartX,endX:r.endX,startY:t,endY:a,count:r.upperStepCount}],m=r.startX-r.landingStartX,n=r.topLandingEndX-r.endX;return e.jsxs("group",{children:[e.jsxs("mesh",{position:[0,se-.75,-2.5],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[22,1.5,4]}),s]}),e.jsxs("mesh",{position:[0,se+.02,-.6],children:[e.jsx("boxGeometry",{args:[22,.05,.3]}),e.jsx("meshBasicMaterial",{color:"#e5bd42"})]}),e.jsxs("mesh",{position:[f,Y.bedY,Y.centerZ],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[c,.4,Y.width]}),e.jsx("meshStandardMaterial",{color:"#111e21",roughness:.95})]}),[-1.5,0,1.5].map(p=>e.jsxs("mesh",{position:[f,Y.bedY+.25,Y.centerZ+p],children:[e.jsx("boxGeometry",{args:[c,.08,.08]}),e.jsx("meshStandardMaterial",{color:"#b3c3bf",metalness:.9,roughness:.22})]},p)),e.jsxs("mesh",{position:[f,i,Y.centerZ],children:[e.jsx("boxGeometry",{args:[c,Y.tunnelHeight,Y.tunnelWidth]}),e.jsx("meshStandardMaterial",{color:"#8fb8b5",transparent:!0,opacity:.035,depthWrite:!1,side:K,roughness:.2,metalness:.08})]}),e.jsxs("mesh",{position:[(r.landingStartX+r.startX)/2,r.baseY-.1,r.z],children:[e.jsx("boxGeometry",{args:[m,.2,r.width]}),s]}),e.jsxs("mesh",{position:[(r.lowerFlightEndX+r.upperFlightStartX)/2,t-.1,r.z],children:[e.jsx("boxGeometry",{args:[r.upperFlightStartX-r.lowerFlightEndX,.2,r.width]}),s]}),e.jsxs("mesh",{position:[r.endX+n/2,a-.1,r.z],children:[e.jsx("boxGeometry",{args:[n,.2,r.width]}),s]}),d.flatMap(p=>{const S=(p.endX-p.startX)/p.count;return Array.from({length:p.count},(F,j)=>{const P=p.startX+(j+.5)*S,x=tt(P,r.baseY,t,a);return e.jsxs("mesh",{position:[P,x-.1,r.z],children:[e.jsx("boxGeometry",{args:[S+r.nosingDepth,.2,r.width]}),s]},`${p.startX}:${j}`)})}),[-8,-4,0,4].map(p=>e.jsxs("mesh",{position:[p,.5,-.6],children:[e.jsx("boxGeometry",{args:[.3,7,.3]}),e.jsx("meshStandardMaterial",{color:"#235160",metalness:.6,roughness:.36})]},p)),je.map((p,S)=>e.jsxs("mesh",{position:[p.x,p.y,p.z],children:[e.jsx("cylinderGeometry",{args:[.18,.18,1.5,8]}),e.jsx("meshStandardMaterial",{color:S%2?"#384f55":"#23363c",roughness:.86})]},S))]})}function jt({viewMode:t,orbitalPlaying:a,orbitSettings:s,parametersVisible:c,onManualChange:f}){const{camera:i,gl:d,size:m}=ge(),n=b.useRef(),p=b.useRef(new B(...ne.find(y=>y.id==="ortho1").position)),S=b.useRef(new B(...Q)),F=b.useRef(null),j=b.useRef(new B),P=b.useRef(new B),x=b.useRef(!1),v=b.useRef(f);v.current=f,b.useEffect(()=>{if(t==="previous"){const l=F.current;if(!l)return;x.current=!1,i.up.copy(l.up),i.zoom=l.zoom,i.fov=l.fov,i.near=l.near,i.far=l.far,i.updateProjectionMatrix(),p.current.copy(l.position),S.current.copy(l.target);return}const y=ne.find(l=>l.id===t);t&&(x.current=!1),t==="orbital"&&i.up.set(0,1,0),y?.position&&(F.current={position:i.position.clone().sub(j.current),target:n.current?.target.clone()??S.current.clone(),up:i.up.clone(),zoom:i.zoom,fov:i.fov,near:i.near,far:i.far}),y?.position&&i.up.fromArray(y.up??[0,1,0]);const D=new B(...y?.position??i.position.toArray());y?.position||D.sub(j.current);const u=new B(...Q),X=he(i,D,u,m,c);P.current.copy(X),p.current.copy(D),S.current.copy(u)},[i,c,m,t]),J((y,D)=>{if(!n.current)return;const u=1-Math.exp(-D*5.5),X=i.position.clone().sub(j.current);if(!x.current&&t&&(t!=="orbital"&&X.lerp(p.current,u),n.current.target.lerp(S.current,u)),!x.current&&t==="orbital"&&a&&s.cameraOrbitOn){const h=n.current.target,G=X.clone().sub(h),O=Math.max(0,Number(s.replayCameraOrbitSpeed)||0)*D;G.applyEuler(new Te(O*(s.replayCameraOrbitX||0),O*(s.replayCameraOrbitY||0),O*(s.replayCameraOrbitZ||0))),X.copy(h).add(G)}const l=!x.current&&t&&t!=="orbital"?p.current:X,I=he(i,l,S.current,m,c);P.current.copy(I),j.current.lerp(P.current,u),i.position.copy(X).add(j.current)});const w=()=>{x.current=!0,v.current()};return b.useEffect(()=>{const y=()=>{x.current=!0,v.current()};return d.domElement.addEventListener("wheel",y,{capture:!0,passive:!0}),()=>d.domElement.removeEventListener("wheel",y,{capture:!0})},[d]),e.jsx(Be,{ref:n,cameraParams:{target:Q,minDistance:12,maxDistance:90,autoRotate:!1,enabled:s.cameraControlsEnabled??!0,enableZoom:s.cameraZoomEnabled&&s.cameraWheelMode==="dolly"},onStart:w})}function wt({settings:t,viewMode:a,orbitalPlaying:s,parametersVisible:c,onManualViewChange:f,onTelemetry:i,onGpuError:d}){const m=b.useRef(),n={tunnelHeight:t.stairUndergroundOpeningHeight,landingY:t.stairLandingHeight,surfaceY:t.stairSurfaceOpeningHeight};return e.jsxs(e.Fragment,{children:[e.jsx("ambientLight",{color:"#8ab0ae",intensity:1.25}),e.jsx("directionalLight",{color:"#fff4dd",intensity:2.3,position:[10,20,15],castShadow:!0}),e.jsx(bt,{...n}),e.jsx(xt,{...n}),e.jsx(yt,{}),e.jsx(pt,{settings:t}),e.jsx(vt,{...n}),e.jsx(gt,{...n}),e.jsx(St,{enabled:t.floodTunnels,flow:t.floodFlow,pumpDirection:t.floodPumpDirection}),e.jsx(ft,{ref:m,active:t.train,brakes:t.brakes}),e.jsx(ut,{settings:t,trainRef:m,onTelemetry:i,onGpuError:d},t.particleCount),e.jsx(Pe,{position:[9,-4,0],opacity:.42,scale:56,blur:2.5,far:8}),e.jsx(jt,{viewMode:a,orbitalPlaying:s,orbitSettings:t,parametersVisible:c,onManualChange:f})]})}function Pt({values:t}){const a=t.map((s,c)=>`${c/(t.length-1)*250},${60-(s-78)/14*52}`).join(" ");return e.jsxs("svg",{className:"sparkline",viewBox:"0 0 250 64",preserveAspectRatio:"none","aria-label":"Station temperature history",children:[e.jsx("path",{d:"M0 48 H250 M0 28 H250",className:"sparkline-grid"}),e.jsx("polyline",{points:a,className:"sparkline-line"})]})}function W({label:t,checked:a,onChange:s,description:c,showDescription:f}){return e.jsxs("label",{className:"toggle-row",children:[e.jsx("input",{type:"checkbox",checked:a,onChange:i=>s(i.target.checked)}),e.jsx("span",{className:"toggle-track",children:e.jsx("span",{})}),e.jsxs("span",{className:"toggle-copy",children:[e.jsx("span",{children:t}),f&&e.jsx("small",{className:"parameter-description",children:c})]})]})}function M({label:t,value:a,min:s,max:c,step:f,precision:i,suffix:d,description:m,showDescription:n,onChange:p,editing:S=!1,isDefault:F=!0,onReset:j}){return e.jsx(We,{className:"slider-control",label:t,value:Number.isFinite(a)?a:s,min:s,max:c,step:f,suffix:d,editing:S,isDefault:F,onReset:j,description:m,showDescription:n,onChange:p})}function ve({history:t,metric:a,label:s,unit:c}){const f=t.flatMap(j=>[j?.intake?.[a],j?.outlet?.[a]]).filter(Number.isFinite),i=a==="flow"?Math.max(1,...f.map(Math.abs)):null,[d,m]=a==="flow"?[-i,i]:Ke(f),n=a==="temperature"?`${d}–${m} ${c}`:c,p=j=>a==="flow"?j===0?"0":j.toFixed(1):`${Number.isInteger(j)?j:j.toFixed(1)}°`,S=[m,(d+m)/2,d],F=j=>t.map((P,x)=>{const v=P?.[j]?.[a];if(!Number.isFinite(v))return null;const w=t.length>1?x/(t.length-1)*220:220,y=42-(v-d)/(m-d)*38;return`${w},${Math.max(2,Math.min(42,y))}`}).filter(Boolean).join(" ");return e.jsxs("div",{className:"vent-chart",children:[e.jsxs("div",{className:"vent-chart-heading",children:[e.jsx("span",{children:s}),e.jsx("span",{children:n})]}),e.jsxs("div",{className:"vent-chart-body",children:[e.jsx("div",{className:"vent-chart-y-axis","aria-hidden":"true",children:S.map(j=>e.jsx("span",{children:p(j)},j))}),e.jsxs("svg",{viewBox:"0 0 220 44",preserveAspectRatio:"none","aria-label":`${s} history`,children:[e.jsx("line",{x1:"0",y1:"2",x2:"220",y2:"2",className:"vent-chart-grid"}),e.jsx("line",{x1:"0",y1:"22",x2:"220",y2:"22",className:"vent-chart-grid"}),e.jsx("line",{x1:"0",y1:"42",x2:"220",y2:"42",className:"vent-chart-grid"}),e.jsx("polyline",{points:F("intake"),className:"vent-chart-line intake"}),e.jsx("polyline",{points:F("outlet"),className:"vent-chart-line outlet"})]})]})]})}function Xt({settings:t,telemetry:a,onSettingsChange:s,showDescriptions:c}){const[f,i]=b.useState(()=>U.map(()=>[]));b.useEffect(()=>{a.shafts.length===U.length&&i(m=>m.map((n,p)=>[...n.slice(-35),a.shafts[p]]))},[a.shafts]);const d=(m,n)=>{const p=[...t.shaftControls];p[m]=n,s({shaftControls:p})};return e.jsxs("details",{className:"parameter-group vent-flow-group",children:[e.jsx("summary",{children:"Vent flow charts"}),e.jsx("div",{className:"vent-flow-list",children:U.map((m,n)=>{const p=a.shafts[n];return e.jsxs("section",{className:"vent-flow-shaft",children:[e.jsx(M,{label:`${be[n]} shaft (${m>0?"+":""}${m} m)`,value:t.shaftControls[n],min:-1,max:1,step:.05,suffix:"",description:"Sets signed ventilation speed for this shaft; negative values reverse vertical flow.",showDescription:c,onChange:S=>d(n,S)}),e.jsx("div",{className:"vent-endpoints",children:["intake","outlet"].map(S=>e.jsxs("div",{className:"vent-endpoint",children:[e.jsx("span",{children:S}),e.jsx("strong",{children:Number.isFinite(p?.[S]?.flow)?`${p[S].flow.toFixed(2)} m/s`:"--"}),e.jsxs("small",{children:[Number.isFinite(p?.[S]?.temperature)?`${p[S].temperature.toFixed(1)}°F`:"--"," · n=",p?.[S]?.count??0]})]},S))}),e.jsx(ve,{history:f[n],metric:"flow",label:"Vertical flow",unit:"m/s"}),e.jsx(ve,{history:f[n],metric:"temperature",label:"Air temperature",unit:"°F"}),e.jsxs("div",{className:"vent-chart-legend",children:[e.jsx("span",{className:"intake",children:"Intake"}),e.jsx("span",{className:"outlet",children:"Outlet"})]})]},m)})})]})}function ye({title:t,items:a,tone:s}){const c=Math.max(...a.map(f=>f.points),1);return e.jsxs("section",{className:"report-contributions",children:[e.jsxs("div",{className:"report-section-heading",children:[e.jsx("span",{children:t}),e.jsxs("strong",{children:[a.reduce((f,i)=>f+i.points,0).toFixed(1)," pts"]})]}),e.jsx("div",{className:"contribution-list",children:a.map(f=>e.jsxs("div",{className:"contribution-row",children:[e.jsxs("div",{className:"contribution-label",children:[e.jsx("span",{children:f.label}),e.jsxs("strong",{className:`contribution-points ${s}`,children:[s==="positive"?"+":"-",f.points.toFixed(1)]})]}),e.jsx("div",{className:"contribution-track",children:e.jsx("span",{className:s,style:{width:`${f.points/c*100}%`}})}),e.jsx("small",{children:f.description})]},f.key))})]})}function Ct({report:t,onClose:a}){return e.jsx("div",{className:"report-layer",onClick:a,children:e.jsxs("section",{className:"report-screen panel",role:"dialog","aria-modal":"true","aria-labelledby":"resilience-report-title",onClick:s=>s.stopPropagation(),children:[e.jsxs("header",{className:"report-header",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"panel-kicker",children:[e.jsx("span",{className:"status-dot"}),"THERMAL RESILIENCE / FIELD REPORT"]}),e.jsx("h2",{id:"resilience-report-title",children:"What is moving the score"})]}),e.jsx("button",{className:"report-close",type:"button",onClick:a,"aria-label":"Close thermal resilience report",children:"Close"})]}),e.jsxs("div",{className:"report-score-block",children:[e.jsx("span",{children:"Current resilience"}),e.jsxs("strong",{children:[t.score,"%"]}),e.jsx("div",{className:"sustainability-meter",children:e.jsx("span",{style:{width:`${t.score}%`}})}),e.jsx("p",{children:"Higher scores favor passive heat removal and penalize powered air movement."})]}),e.jsxs("div",{className:"report-equation",children:[e.jsx("span",{children:"Baseline"}),e.jsx("strong",{children:t.baseline.toFixed(0)}),e.jsx("span",{children:"+"}),e.jsx("strong",{className:"positive-text",children:t.passiveTotal.toFixed(1)}),e.jsx("span",{children:"-"}),e.jsx("strong",{className:"negative-text",children:t.activeTotal.toFixed(1)}),e.jsx("span",{children:"="}),e.jsx("strong",{children:t.score})]}),e.jsx(ye,{title:"Passive cooling credits",items:t.passive,tone:"positive"}),e.jsx(ye,{title:"Active airflow load",items:t.active,tone:"negative"}),e.jsxs("div",{className:"report-note",children:[e.jsx("strong",{children:"Field note"}),e.jsx("span",{children:"Surface temperature changes floor buoyancy and particle heat, but remains a physical input rather than a resilience-score credit or penalty."})]})]})})}function Ft({settings:t,onSettingsChange:a,telemetry:s,gpuError:c,sustainabilityScore:f,showDescriptions:i,onShowDescriptionsChange:d,onOpenReport:m,onHide:n,editing:p=!1,onEditing:S=()=>{},canUndo:F=!1,canRedo:j=!1,onUndo:P=()=>{},onRedo:x=()=>{},onReset:v=()=>{}}){const{temperature:w}=s,[y,D]=b.useState(()=>new Array(48).fill(81.5));return b.useEffect(()=>{D(u=>[...u.slice(-47),w])},[w]),e.jsx("aside",{className:"telemetry-panel panel",children:e.jsxs(ke,{editing:p,children:[e.jsxs("div",{className:"panel-topline",children:[e.jsxs("div",{className:"panel-kicker",children:[e.jsx("span",{className:`status-dot ${c?"status-error":""}`}),"LIVE / TEST CHAMBER"]}),e.jsx("button",{className:"panel-hide",type:"button",onClick:n,children:"Hide"})]}),e.jsxs("div",{className:"subway-editor-toolbar",children:[e.jsx(He,{checked:p,onChange:S}),e.jsx(Ie,{canUndo:F,canRedo:j,onUndo:P,onRedo:x})]}),e.jsx(Ve,{configuration:t,onChange:a,className:"parameter-group"}),e.jsx(Le,{configuration:t,onChange:a,className:"parameter-group",capabilities:{shape:!1,derivativeOrder:!1,colorMode:!1,color:!1},fields:[{key:"sizeScale",path:"particleDiameter",type:"range",label:"Particle diameter",min:.2,max:1.4,step:.05,suffix:" m"},{key:"shape",path:"particleAppearance.shape",type:"select",label:"Particle shape",options:["native"],disabled:!0},{key:"derivativeOrder",path:"particleAppearance.derivativeOrder",type:"range",label:"Derivative order",min:0,max:4,step:1,disabled:!0},{key:"color",path:"particleAppearance.color",type:"color",label:"Particle tint",disabled:!0},{key:"opacity",path:"particleAppearance.opacity",type:"range",label:"Particle opacity",min:0,max:1,step:.01}]}),e.jsxs("div",{className:"telemetry-heading",children:[e.jsx("span",{children:"Ambient field"}),e.jsxs("strong",{children:[w.toFixed(1),"°F"]})]}),e.jsx(Pt,{values:y}),c&&e.jsxs("p",{className:"error-copy",children:["GPU field offline: ",c]}),e.jsxs("div",{className:"sustainability-readout",children:[e.jsxs("div",{className:"sustainability-heading",children:[e.jsx("span",{children:"Thermal resilience"}),e.jsxs("strong",{children:[f,"%"]})]}),e.jsx("div",{className:"sustainability-meter",children:e.jsx("span",{style:{width:`${f}%`}})}),e.jsxs("div",{className:"balance-labels",children:[e.jsx("span",{children:"PASSIVE FIRST"}),e.jsx("span",{children:"LOW ENERGY LOAD"})]}),e.jsx("button",{className:"report-link",type:"button",onClick:m,children:"Open resilience report"})]}),e.jsx("div",{className:"description-toggle",children:e.jsx(W,{label:"Show descriptions",checked:i,onChange:d})}),e.jsxs("div",{className:"primary-parameter",children:[e.jsx(M,{label:"Surface temperature",value:t.surfaceTemperature,min:60,max:110,step:.5,suffix:"°F",description:"Sets the station floor's thermal influence on nearby air.",showDescription:i,onChange:u=>a({surfaceTemperature:u})}),e.jsx(M,{label:"Passenger heat",value:t.passengerHeat,min:0,max:1.5,step:.05,suffix:"",description:"Adds localized body heat around the visible passengers.",showDescription:i,onChange:u=>a({passengerHeat:u})}),e.jsx(M,{label:"Road surface temperature",value:t.roadSurfaceTemperature,min:45,max:130,step:.5,suffix:"°F",description:"Sets the outdoor road temperature that drives upward convection above the street.",showDescription:i,onChange:u=>a({roadSurfaceTemperature:u})}),e.jsx(M,{label:"Ambient air above road",value:t.ambientAirTemperature,min:40,max:110,step:.5,suffix:"°F",description:"Sets the outdoor air temperature that the upper field gradually approaches.",showDescription:i,onChange:u=>a({ambientAirTemperature:u})}),e.jsx(M,{label:"Surface crosswind",value:t.surfaceCrosswind,min:-8,max:8,step:.25,suffix:" m/s",description:"Sets outdoor wind across the station along the Z axis; negative values reverse direction.",showDescription:i,onChange:u=>a({surfaceCrosswind:u})}),e.jsx(M,{label:"Stair underground opening",value:t.stairUndergroundOpeningHeight,min:2.2,max:5,step:.1,precision:2,suffix:" m",description:"Sets underground tunnel and doorway clear height without moving the stairs or turnstiles.",showDescription:i,onChange:u=>a({stairUndergroundOpeningHeight:u})}),e.jsx(M,{label:"Stair landing height",value:t.stairLandingHeight,min:1,max:5,step:.1,precision:2,suffix:" m",description:"Sets the level elevation between the lower and upper stair flights.",showDescription:i,onChange:u=>a({stairLandingHeight:u})}),e.jsx(M,{label:"Stair surface opening",value:t.stairSurfaceOpeningHeight,min:8.2,max:10,step:.1,precision:2,suffix:" m",description:"Sets the street opening elevation and moves the street and ventilation outlets with it.",showDescription:i,onChange:u=>a({stairSurfaceOpeningHeight:u})})]}),e.jsxs("div",{className:"toggles-group",children:[e.jsx(W,{label:"Allow trains to run",checked:t.train,description:"Runs one train through the station at the configured interval.",showDescription:i,onChange:u=>a({train:u})}),e.jsx(W,{label:"Powered shaft fans",checked:t.shaftFans,description:"Adds powered upward airflow in the three ventilation shafts.",showDescription:i,onChange:u=>a({shaftFans:u})}),e.jsx(W,{label:"Clerestory windows",checked:t.clerestoryWindows,description:"Shows the bridging windows and enables clerestory exchange.",showDescription:i,onChange:u=>a({clerestoryWindows:u})}),e.jsx(W,{label:"Wind resistance / occlusion",checked:t.windOcclusion,description:"Deflects airflow around station columns, platforms, and the train.",showDescription:i,onChange:u=>a({windOcclusion:u})}),e.jsx(W,{label:"AC exhaust heat",checked:t.ac,description:"Adds heat and lift near the active train.",showDescription:i,onChange:u=>a({ac:u})}),e.jsx(W,{label:"Brake friction",checked:t.brakes,description:"Adds localized heat and turbulence during braking.",showDescription:i,onChange:u=>a({brakes:u})}),e.jsx(W,{label:"Flood control tunnels",checked:t.floodTunnels,description:"Enables the below-station cold-sink gallery.",showDescription:i,onChange:u=>a({floodTunnels:u})})]}),e.jsxs("div",{className:"systems-group",children:[e.jsx("div",{className:"subsection-label",children:"SUSTAINABLE AIRFLOW SYSTEMS"}),e.jsx(M,{label:"Shaft exchange",value:t.shaftExchange,min:0,max:1,step:.05,suffix:"",description:"Captures air toward the three passive vertical shafts.",showDescription:i,onChange:u=>a({shaftExchange:u})}),e.jsx(M,{label:"Shaft fan velocity",value:t.shaftFanVelocity,min:0,max:8,step:.25,suffix:" m/s",description:"Sets upward powered airflow through each ventilation shaft.",showDescription:i,onChange:u=>a({shaftFanVelocity:u})}),e.jsx(M,{label:"Downward fans",value:t.downFans,min:0,max:1,step:.05,suffix:"",description:"Pushes air down from the station ceiling fan banks.",showDescription:i,onChange:u=>a({downFans:u})}),e.jsx(M,{label:"Floor air movers",value:t.floorAirMovers,min:0,max:1,step:.05,suffix:"",description:"Blows air across the platform floor toward the stair route.",showDescription:i,onChange:u=>a({floorAirMovers:u})}),e.jsx(M,{label:"Ceiling flow",value:t.ceilingFans,min:0,max:1,step:.05,suffix:"",description:"Sweeps the warm ceiling band toward the egress.",showDescription:i,onChange:u=>a({ceilingFans:u})}),e.jsx(M,{label:"Passive grooves",value:t.grooves,min:0,max:1,step:.05,suffix:"",description:"Adds low-energy guidance along the roof grooves.",showDescription:i,onChange:u=>a({grooves:u})}),e.jsx(M,{label:"Roof pitch",value:t.roofPitch,min:-28,max:28,step:1,suffix:"°",description:"Tilts the roof envelope and changes buoyant headroom.",showDescription:i,onChange:u=>a({roofPitch:u})}),e.jsx(M,{label:"Ridge offset",value:t.roofOffset,min:-2,max:2,step:.1,suffix:" z",description:"Moves the roof ridge across the station width.",showDescription:i,onChange:u=>a({roofOffset:u})}),e.jsx(M,{label:"Roof gap: horizontal",value:t.roofGapHorizontal,min:.1,max:2.4,step:.1,suffix:" m",description:"Sets the horizontal distance between the two roof panels.",showDescription:i,onChange:u=>a({roofGapHorizontal:u})}),e.jsx(M,{label:"Roof gap: vertical",value:t.roofGapVertical,min:.1,max:3,step:.1,suffix:" m",description:"Sets the height bridged by each clerestory pane.",showDescription:i,onChange:u=>a({roofGapVertical:u})}),e.jsx(M,{label:"Clerestory opening",value:t.clerestoryOpen,min:0,max:1,step:.05,suffix:"",description:"Controls passive exchange through the clerestory span.",showDescription:i,onChange:u=>a({clerestoryOpen:u})}),e.jsx(M,{label:"Shaft stack effect",value:t.stackEffect,min:0,max:1,step:.05,suffix:"",description:"Applies passive localized shaft lift to warm air; powered fans and crosswind draw remain separate.",showDescription:i,onChange:u=>a({stackEffect:u})}),e.jsx(M,{label:"Flood gallery flow",value:t.floodFlow,min:0,max:1,step:.05,suffix:"",description:"Pulls warm lower air into the gallery as a cold sink.",showDescription:i,onChange:u=>a({floodFlow:u})}),e.jsx(M,{label:"Flood pump direction",value:t.floodPumpDirection,min:-1,max:1,step:.1,suffix:"",description:"Sets the flood-gallery air-pump direction along X.",showDescription:i,onChange:u=>a({floodPumpDirection:u})})]}),e.jsxs("div",{className:"controls-group",children:[e.jsx("div",{className:"subsection-label",children:"SIMULATION"}),e.jsx(M,{label:"Train interval",value:t.trainInterval,min:8,max:60,step:1,suffix:" s",description:"Time from the start of one train pass to the next.",showDescription:i,onChange:u=>a({trainInterval:u})}),e.jsx(M,{label:"Train stop frequency",value:t.trainStopFrequency,min:0,max:1,step:.05,suffix:"",description:"Sets the fraction of train passes that stop at the platform.",showDescription:i,onChange:u=>a({trainStopFrequency:u})}),e.jsx(M,{label:"Train stop duration",value:t.trainStopDuration,min:0,max:30,step:1,suffix:" s",description:"Sets how long a stopping train dwells at the platform.",showDescription:i,onChange:u=>a({trainStopDuration:u})}),e.jsx(M,{label:"Particle count",value:t.particleCount,min:1024,max:9216,step:512,suffix:"",description:"Rebuilds the GPU field with the selected number of rendered particles.",showDescription:i,onChange:u=>a({particleCount:u})}),e.jsx(M,{label:"Velocity diameter response",value:t.particleMagnitudeScale,min:0,max:2,step:.05,suffix:"",description:"Scales individual particle diameter according to velocity magnitude.",showDescription:i,onChange:u=>a({particleMagnitudeScale:u})})]}),e.jsx(Xt,{settings:t,telemetry:s,onSettingsChange:a,showDescriptions:i}),e.jsxs("details",{className:"parameter-group",children:[e.jsx("summary",{children:"Fluid parameters"}),e.jsxs("div",{className:"controls-group",children:[e.jsx(Ze,{label:"Constitutive model",value:t.constitutiveModel,options:Ue,onChange:u=>a({constitutiveModel:u})}),e.jsx(M,{label:"Constitutive strength",value:t.constitutiveStrength,min:0,max:10,step:.05,suffix:"",description:"Scales the selected experimental shear response.",showDescription:i,onChange:u=>a({constitutiveStrength:u})}),t.constitutiveModel==="ddf"&&e.jsx(M,{label:"DDF speed limit",value:t.constitutiveSpeedLimit,min:.1,max:20,step:.1,suffix:" m/s",description:"Sets the dimensionless onset scale for the DDF viscosity increase.",showDescription:i,onChange:u=>a({constitutiveSpeedLimit:u})}),e.jsx(M,{label:"Air density",value:t.density,min:.5,max:3,step:.05,suffix:" kg/m³",description:"Mass packed into each simulated air volume.",showDescription:i,onChange:u=>a({density:u})}),e.jsx(M,{label:"Fluid stiffness",value:t.stiffness,min:1,max:20,step:.5,suffix:"",description:"How strongly nearby particles resist compression.",showDescription:i,onChange:u=>a({stiffness:u})}),e.jsx(M,{label:"Viscosity",value:t.viscosity,min:.001,max:.05,step:.001,suffix:" Pa·s",description:"How quickly neighboring air velocities blend.",showDescription:i,onChange:u=>a({viscosity:u})})]})]})]})})}function zt({onBack:t}){const a=Ee(g),{value:s,commit:c,load:f,canUndo:i,canRedo:d,undo:m,redo:n}=a,[p,S]=b.useState(!1),[F,j]=b.useState(!1),[P,x]=b.useState(!0),[v,w]=b.useState("ortho1"),[y,D]=b.useState(!0),[u,X]=b.useState(!1),[l,I]=b.useState({temperature:81.5,shafts:[]}),[h,G]=b.useState("");ze({undo:m,redo:n,canUndo:i,canRedo:d,isTextEditing:z=>["INPUT","TEXTAREA","SELECT"].includes(z.tagName)});const O=z=>c(V=>({...V,...z})),k=et(s);return b.useEffect(()=>{if(!u)return;const z=V=>{V.key==="Escape"&&X(!1)};return window.addEventListener("keydown",z),()=>window.removeEventListener("keydown",z)},[u]),e.jsxs(Ae,{className:"app-shell",headerClassName:"topbar",brandClassName:"brand-lockup",mark:"T",markClassName:"brand-mark",title:"TRANSIT / UNDERGROUND",subtitle:"Thermodynamics lab",meta:e.jsxs(e.Fragment,{children:[e.jsx("span",{children:"GPGPU / SPH"}),e.jsx("span",{children:"FIELD 04"})]}),metaClassName:"subway-base-actions",metaContentClassName:"topbar-meta",parameterValue:s,presetValue:a.baseline,onParameterChange:z=>c(z),onHome:t,homeClassName:"mode-switch",children:[e.jsx("div",{className:"scene-layer",children:e.jsxs(we,{camera:{position:[7,20,55],fov:45,near:.1,far:1e3},dpr:[1,2],gl:{antialias:!0,powerPreference:"high-performance"},children:[e.jsx("color",{attach:"background",args:["#071316"]}),e.jsx("fog",{attach:"fog",args:["#071316",28,72]}),e.jsx(wt,{settings:s,viewMode:v,orbitalPlaying:y,parametersVisible:P,onManualViewChange:()=>w(null),onTelemetry:I,onGpuError:G})]})}),e.jsx(Ne,{className:"view-toolbar panel",modesClassName:"view-modes",views:ne,viewMode:v,onViewChange:w,orbitPlaying:y,onToggleOrbit:()=>D(z=>!z),controls:e.jsx("button",{className:"params-toggle",type:"button","aria-pressed":P,onClick:()=>x(z=>!z),children:P?"Hide params":"Show params"})}),P&&e.jsx(Ft,{settings:s,onSettingsChange:O,telemetry:l,gpuError:h,sustainabilityScore:k.score,showDescriptions:F,onShowDescriptionsChange:j,onOpenReport:()=>X(!0),onHide:()=>x(!1),editing:p,onEditing:S,canUndo:i,canRedo:d,onUndo:m,onRedo:n,onReset:()=>f(g)}),e.jsxs("aside",{className:"legend-panel panel",children:[e.jsxs("div",{className:"legend-heading",children:[e.jsx("span",{children:"Thermal dispersion"}),e.jsx("span",{className:"legend-unit",children:"NORMALIZED / 0—1"})]}),e.jsx("div",{className:"gradient-bar"}),e.jsxs("div",{className:"legend-labels",children:[e.jsxs("span",{children:["60°F ",e.jsx("small",{children:"cool air"})]}),e.jsxs("span",{children:["85°F ",e.jsx("small",{children:"mixed"})]}),e.jsxs("span",{children:["110°F ",e.jsx("small",{children:"heat input"})]})]})]}),u&&e.jsx(Ct,{report:k,onClose:()=>X(!1)}),e.jsxs("footer",{className:"footer-note",children:[e.jsx("span",{children:"PLATFORM 04 / ACTIVE"}),e.jsx("span",{children:"Drag to orbit · Scroll to zoom"})]})]})}export{zt as SubwaySim};
