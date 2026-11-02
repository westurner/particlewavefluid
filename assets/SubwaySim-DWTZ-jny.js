import{b as S,j as e}from"./react-Bwx2ax-9.js";import{C as ge,b as Se,u as J,a as ye}from"./react-three-DWpeIH4f.js";import{D as K,a2 as L,al as be,v as je,ag as Pe,f as we,aa as Ce,e as re,h as B,E as Te,am as ne,an as le,ao as Re}from"./three-core-BS9w8j8o.js";import{c as Fe,a as De}from"./gpuParticleRuntime-DF89lSKF.js";import{u as Xe,a0 as Me,b as Ye,a1 as Oe,S as $e,C as Ee,B as Ae,I as ze,g as Ne,H as Ge,O as He,h as Ie,a2 as U,a3 as W,j as ke,a4 as Ve,a5 as ce,a6 as F,a7 as o,a8 as ve,a9 as C,aa as O,ab as V,ac as ae,ad as ue,ae as q,af as H,ag as D,ah as G,ai as M,aj as $,ak as Le,al as Be,am as fe,an as Ze,ao as me,ap as We,aq as Ue,R as _e,N as qe,ar as Ke,as as Je,at as Q,au as t,av as Qe,aw as _,ax as ea,ay as aa,az as oe}from"./SimulatorBase-M_Mc28gW.js";import"./three-extras-DuUFURCc.js";import"./index-DkCnGIRm.js";const v=Me,ee=[(F.minX+F.maxX)/2,3,0],se=Ae({target:ee,distance:61,frontDistance:72,frontDirection:-1,ortho1Offset:[41,35,48],ortho2Offset:[-41,35,-48]}),ie={breakpoint:700,width:306,right:28};function pe(a,r,c,u,m){if(!m||u.width<=ie.breakpoint)return new B;const y=(ie.width+ie.right)/2,n=2*r.distanceTo(c)*Math.tan(L.degToRad(a.fov)/2)*u.width/u.height;return c.clone().sub(r).normalize().cross(new B(0,1,0)).normalize().multiplyScalar(y*n/u.width)}const ta=ve.map(a=>`passengerInfluence = max(passengerInfluence, (1.0 - smoothstep(0.25, 1.6, length(particlePosition.xz - vec2(${t(a.x)}, ${t(a.z)})))) * (1.0 - smoothstep(0.4, 1.9, abs(particlePosition.y - ${t(a.y)}))));`).join(`
    `),ra=`
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
        positionData.x - ${t(C.minX)},
        ${t(C.maxX-C.minX)}
      ) + ${t(C.minX)};
    } else {
      if (positionData.x < ${t(C.minX)}) positionData.x += ${t(C.maxX-C.minX)};
      if (positionData.x > ${t(C.maxX)}) positionData.x -= ${t(C.maxX-C.minX)};
    }
    positionData.y = clamp(positionData.y, ${t(C.minY)}, ${t(C.maxY)});
    if (positionData.y >= uStreetY) {
      positionData.z = mod(
        positionData.z - ${t(C.minZ)},
        ${t(C.maxZ-C.minZ)}
      ) + ${t(C.minZ)};
    } else {
      positionData.z = clamp(positionData.z, ${t(C.minZ)}, ${t(C.maxZ)});
    }
    if (!uFloodTunnels) positionData.y = max(positionData.y, ${t(M.maxY)});

    float trackGroundContact = step(${t(F.minX)}, positionData.x)
      * step(positionData.x, ${t(F.maxX)})
      * step(abs(positionData.z - ${t(F.centerZ)}), ${t(F.tunnelWidth/2)});
    if (trackGroundContact > 0.5) positionData.y = max(positionData.y, ${t(_.trackFloorY)});

    float stairX = positionData.x;
    float lowerStairProgress = clamp((stairX - ${t(o.startX)}) / ${t(o.lowerFlightEndX-o.startX)}, 0.0, 1.0);
    float upperStairProgress = clamp((stairX - ${t(o.upperFlightStartX)}) / ${t(o.endX-o.upperFlightStartX)}, 0.0, 1.0);
    float stairSurfaceY = stairX < ${t(o.lowerFlightEndX)}
      ? mix(${t(o.baseY)}, uStairLandingY, lowerStairProgress)
      : (stairX <= ${t(o.upperFlightStartX)} ? uStairLandingY : mix(uStairLandingY, uStairSurfaceY, upperStairProgress));
    float stairZone = step(${t(o.landingStartX)}, stairX) * step(stairX, ${t(o.endX)});
    float stairDistance = abs(positionData.z - ${t(o.z)});
    float stairFoundationContact = stairZone * step(stairDistance, ${t(o.width/2)});
    if (stairFoundationContact > 0.5) positionData.y = max(positionData.y, ${t(_.stairFloorY)});
    float stairOuterGroundContact = stairZone
      * step(${t(o.baseY)}, positionData.y)
      * step(positionData.y, stairSurfaceY + uStairTunnelHeight)
      * step(${t(C.minZ)}, positionData.z)
      * step(positionData.z, ${t(_.stairOuterZ)});
    if (stairOuterGroundContact > 0.5) positionData.z = ${t(_.stairOuterZ+.02)};
    float stairContact = stairZone * (1.0 - smoothstep(0.0, 1.7, stairDistance));
    float thermalContact = smoothstep(0.05, 0.4, velocityData.w) * stairContact;
    if (thermalContact > 0.0 && positionData.y < stairSurfaceY + 0.12) {
      positionData.y = mix(positionData.y, stairSurfaceY + 0.12, thermalContact);
    }
    float stairUnderfillContact = step(${t(o.startX)}, stairX)
      * step(stairX, ${t(o.endX)})
      * step(stairDistance, ${t(o.width/2)});
    if (stairUnderfillContact > 0.5) positionData.y = max(positionData.y, stairSurfaceY + 0.12);

    float turnstileXContact = step(abs(positionData.x - ${t(O.x)}), ${t(O.halfDepth)});
    float turnstileYContact = step(${t(o.baseY)}, positionData.y)
      * step(positionData.y, ${t(o.baseY+O.pedestalHeight)});
    float turnstilePedestalContact = max(
      max(
        step(abs(positionData.z - ${t(O.pedestalZ[0])}), ${t(O.pedestalHalfWidth)}),
        step(abs(positionData.z - ${t(O.pedestalZ[1])}), ${t(O.pedestalHalfWidth)})
      ),
      max(
        step(abs(positionData.z - ${t(O.pedestalZ[2])}), ${t(O.pedestalHalfWidth)}),
        step(abs(positionData.z - ${t(O.pedestalZ[3])}), ${t(O.pedestalHalfWidth)})
      )
    );
    if (turnstileXContact * turnstileYContact * turnstilePedestalContact > 0.5) {
      positionData.x = ${t(O.x)} + (velocityData.x >= 0.0 ? -${t(O.halfDepth)} : ${t(O.halfDepth)});
    }

    float roofRidgeY = 4.0 + tan(uRoofPitch) * 2.3;
    float roofCeiling = positionData.z <= uRoofOffset
      ? mix(4.0, roofRidgeY, clamp((positionData.z + 4.6) / (uRoofOffset + 4.6), 0.0, 1.0))
      : uRoofGapVertical + mix(roofRidgeY, 4.0, clamp((positionData.z - uRoofOffset) / (4.6 - uRoofOffset), 0.0, 1.0));
    float clerestoryHalfGap = max(${t(D.clerestoryMinGap)}, uRoofGapHorizontal * 0.5);
    float clerestoryOpening = (uClerestoryWindows ? 1.0 : 0.0) * uClerestoryOpen * uRoofGapVertical
      * (1.0 - smoothstep(clerestoryHalfGap, clerestoryHalfGap + 0.35, abs(positionData.z - uRoofOffset)));
    float shaftNorth = 1.0 - smoothstep(0.0, 1.25, abs(positionData.x + 7.0));
    float shaftCenter = 1.0 - smoothstep(0.0, 1.25, abs(positionData.x));
    float shaftSouth = 1.0 - smoothstep(0.0, 1.25, abs(positionData.x - 7.0));
    float shaftOpening = max(shaftNorth, max(shaftCenter, shaftSouth))
      * (1.0 - smoothstep(0.0, 1.1, abs(positionData.z - ${t(H.z)})))
      * smoothstep(0.4, ${t(H.throatY)}, positionData.y);
    float stairTunnelCeiling = stairSurfaceY + uStairTunnelHeight;
    float stairPassage = stairZone
      * (1.0 - smoothstep(0.0, ${t(o.width/2)}, stairDistance))
      * step(positionData.y, stairTunnelCeiling);
    float stairExit = step(${t(o.endX-1.4)}, stairX)
      * (1.0 - smoothstep(0.0, ${t(o.width/2)}, stairDistance))
      * step(stairX, ${t(o.topLandingEndX)})
      * step(stairSurfaceY, positionData.y);
    float surfaceOpening = max(step(0.05, shaftOpening), stairExit);
    if (positionData.w > 1.5 && surfaceOpening < 0.5) positionData.y = max(positionData.y, uSurfaceFloorY);
    if (stairPassage > 0.5) positionData.y = min(positionData.y, max(roofCeiling, stairTunnelCeiling));
    if (positionData.w < 1.5 && shaftOpening < 0.05 && stairExit < 0.5 && clerestoryOpening < 0.05) positionData.y = min(positionData.y, roofCeiling);

    gl_FragColor = positionData;
  }
`,oa=`
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
      float surfaceSpan = ${t(C.maxZ-C.minZ)};
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
    ${ta}
    if (surfaceParticle < 0.5) {
      acceleration.y += passengerInfluence * uPassengerHeat * 0.8;
      thermalIntensity = clamp(thermalIntensity + uDt * passengerInfluence * uPassengerHeat * 0.18, 0.0, 1.0);
    }
    float roadBand = surfaceParticle
      * step(uStreetY, particlePosition.y)
      * (1.0 - smoothstep(0.0, 2.4, particlePosition.y - uStreetY))
      * step(${t(G.minX)}, particlePosition.x)
      * step(particlePosition.x, ${t(G.maxX)})
      * step(${t(Q.sidewalkRoadEdgeZ)}, particlePosition.z)
      * step(particlePosition.z, ${t(G.maxZ)});
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
      uSurfaceFloorY + ${t(oe.minimumHeight)},
      ${t(C.maxY-oe.ceilingMargin)},
      surfaceMixFraction
    );
    float surfaceShaftNorth = 1.0 - smoothstep(0.55, 1.4, abs(particlePosition.x + 7.0));
    float surfaceShaftCenter = 1.0 - smoothstep(0.55, 1.4, abs(particlePosition.x));
    float surfaceShaftSouth = 1.0 - smoothstep(0.55, 1.4, abs(particlePosition.x - 7.0));
    float surfaceShaftOutlet = max(surfaceShaftNorth, max(surfaceShaftCenter, surfaceShaftSouth))
      * (1.0 - smoothstep(0.45, 1.25, abs(particlePosition.z - ${t(H.z)})))
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
    float surfaceCeilingReturn = smoothstep(${t(C.maxY-1.5)}, ${t(C.maxY-.2)}, particlePosition.y);
    acceleration.y += surfaceFloorReturn * (0.9 + max(0.0, -particleVelocity.y) * 6.0);
    acceleration.y += abs(uSurfaceCrosswind) * surfaceShaftOutlet * surfaceShaftControl * 1.8;
    acceleration.y += surfaceParticle * abs(uSurfaceCrosswind)
      * (surfaceMixTargetY - particlePosition.y) * ${t(oe.strength)} * surfaceWindBand
      * (1.0 - surfaceShaftOutlet * surfaceShaftControlMagnitude);
    acceleration.y -= surfaceCeilingReturn * (4.0 + max(0.0, particleVelocity.y) * 6.0);
    acceleration.z += (uSurfaceCrosswind - particleVelocity.z) * surfaceWindBand * 1.2 * (1.0 - surfaceShaftOutlet * surfaceShaftControlMagnitude * 0.82);

    float stairX = particlePosition.x;
    float lowerStairProgress = clamp((stairX - ${t(o.startX)}) / ${t(o.lowerFlightEndX-o.startX)}, 0.0, 1.0);
    float upperStairProgress = clamp((stairX - ${t(o.upperFlightStartX)}) / ${t(o.endX-o.upperFlightStartX)}, 0.0, 1.0);
    float stairSurfaceY = stairX < ${t(o.lowerFlightEndX)}
      ? mix(${t(o.baseY)}, uStairLandingY, lowerStairProgress)
      : (stairX <= ${t(o.upperFlightStartX)} ? uStairLandingY : mix(uStairLandingY, uStairSurfaceY, upperStairProgress));
    float stairProgress = clamp((stairX - ${t(o.startX)}) / ${t(o.endX-o.startX)}, 0.0, 1.0);
    float stairZone = step(${t(o.landingStartX)}, stairX) * step(stairX, ${t(o.endX)});
    float stairProximity = stairZone
      * (1.0 - smoothstep(0.0, 1.7, abs(particlePosition.z - ${t(o.z)})))
      * (1.0 - smoothstep(0.0, 1.8, abs(particlePosition.y - stairSurfaceY)));
    float stairApproach = smoothstep(${t(o.landingStartX-1.5)}, ${t(o.landingStartX)}, stairX)
      * (1.0 - smoothstep(${t(o.endX-1.5)}, ${t(o.endX)}, stairX));
    float stairSlope = stairX < ${t(o.lowerFlightEndX)}
      ? (uStairLandingY - ${t(o.baseY)}) / ${t(o.lowerFlightEndX-o.startX)}
      : (stairX <= ${t(o.upperFlightStartX)}
        ? 0.0
        : (uStairSurfaceY - uStairLandingY) / ${t(o.endX-o.upperFlightStartX)});
    vec3 stairDirection = normalize(vec3(1.0, stairSlope, 0.0));
    acceleration += stairDirection * stairProximity * (0.45 + thermalIntensity * 2.4);
    acceleration += stairDirection * stairProximity * abs(uSurfaceCrosswind) * (0.12 + stairProgress * 0.28);
    acceleration.z += (${t(o.z)} - particlePosition.z) * stairApproach * thermalIntensity * 0.35;
    float stairExit = smoothstep(${t(o.endX-2.4)}, ${t(o.endX)}, stairX)
      * (1.0 - smoothstep(0.0, ${t(o.width/2)}, abs(particlePosition.z - ${t(o.z)})))
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
      * (1.0 - smoothstep(0.0, 1.3, abs(particlePosition.z - ${t(H.z)})))
      * smoothstep(0.4, 2.5, particlePosition.y)
      * shaftCaptureHeight;
    float shaftVerticalColumn = shaftInfluence
      * (1.0 - smoothstep(0.0, 0.9, abs(particlePosition.z - ${t(H.z)})))
      * smoothstep(0.4, ${t(H.throatY)}, particlePosition.y)
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
      (1.0 - smoothstep(${t(D.fanRadius*.6)}, ${t(D.fanRadius)}, abs(particlePosition.x + 6.0))),
      max(
        (1.0 - smoothstep(${t(D.fanRadius*.6)}, ${t(D.fanRadius)}, abs(particlePosition.x))),
        (1.0 - smoothstep(${t(D.fanRadius*.6)}, ${t(D.fanRadius)}, abs(particlePosition.x - 6.0)))
      )
    )
      * (1.0 - smoothstep(1.4, 2.3, abs(particlePosition.z - ${t(D.fanZ)})))
      * smoothstep(${t(D.fanMinY)}, ${t(D.fanMinY+.4)}, particlePosition.y)
      * (1.0 - smoothstep(${t(D.fanMaxY-.4)}, ${t(D.fanMaxY)}, particlePosition.y));
    float floodCaptureBand = 1.0 - smoothstep(0.0, 1.6, abs(particlePosition.y + 3.1));
    float floodGalleryBand = (1.0 - smoothstep(0.0, ${t(M.radius)}, abs(particlePosition.z - ${t(M.z)})))
      * (1.0 - smoothstep(${t(M.minY)}, ${t(M.maxY)}, particlePosition.y));
    float floorMoverInfluence = max(
      (1.0 - smoothstep(${t(D.fanRadius*.6)}, ${t(D.fanRadius)}, abs(particlePosition.x + 6.0))),
      max(
        (1.0 - smoothstep(${t(D.fanRadius*.6)}, ${t(D.fanRadius)}, abs(particlePosition.x))),
        (1.0 - smoothstep(${t(D.fanRadius*.6)}, ${t(D.fanRadius)}, abs(particlePosition.x - 6.0)))
      )
    )
      * (1.0 - smoothstep(1.0, 1.8, abs(particlePosition.z - ${t(D.floorMoverZ)})))
      * smoothstep(${t(D.floorMoverMinY)}, ${t(D.floorMoverMinY+.4)}, particlePosition.y)
      * (1.0 - smoothstep(${t(D.floorMoverMaxY-.4)}, ${t(D.floorMoverMaxY)}, particlePosition.y));

    if (particlePosition.y > 0.4) {
      acceleration.x += (shaftTargetX - particlePosition.x)
        * shaftHorizontalCapture * uShaftExchange * 0.9;
      float poweredShaftLift = uShaftFans ? uShaftFanVelocity : 0.0;
      float crosswindDraw = abs(uSurfaceCrosswind) * 0.3;
      acceleration.x += (shaftTargetX - particlePosition.x) * shaftVerticalColumn * 3.6;
      acceleration.y += shaftVerticalColumn * sign(shaftControl) * (uShaftExchange * 2.4 + uStackEffect * 3.4 + poweredShaftLift + crosswindDraw) * (0.35 + thermalIntensity * 1.8);
      acceleration.z += (${t(H.z)} - particlePosition.z) * shaftVerticalColumn * 4.4;
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
    float clerestoryWidth = max(${t(D.clerestoryMinGap)}, uRoofGapHorizontal * 0.5);
    float clerestoryHeight = max(0.05, uRoofGapVertical);
    float clerestoryBand = (1.0 - smoothstep(0.0, clerestoryWidth, abs(particlePosition.z - uRoofOffset)))
      * smoothstep(roofCeiling - clerestoryHeight, roofCeiling + 0.9, particlePosition.y);
    if (uClerestoryWindows && uClerestoryOpen > 0.0 && clerestoryBand > 0.0) {
      acceleration.y += clerestoryBand * uClerestoryOpen * (0.8 + uStackEffect * 2.2) * (0.35 + thermalIntensity * 1.7);
      thermalIntensity = max(0.0, thermalIntensity - uDt * clerestoryBand * uClerestoryOpen * 0.25);
    }
    if (uFloodTunnels) {
      float waterfallRadial = length(vec2(particlePosition.x - ${t($.x)}, particlePosition.z - ${t($.z)}));
      float waterfallBand = (1.0 - smoothstep(${t($.radius*.5)}, ${t($.radius)}, waterfallRadial))
        * smoothstep(${t($.bottomY)}, ${t($.bottomY+.4)}, particlePosition.y)
        * (1.0 - smoothstep(${t($.topY-.4)}, ${t($.topY)}, particlePosition.y));
      acceleration.y -= uFloodFlow * floodBand * floodCaptureBand * 0.8;
      acceleration.y -= uFloodFlow * waterfallBand * 2.4;
      acceleration.z += (${t(M.z)} - particlePosition.z) * uFloodFlow * floodCaptureBand * 0.45;
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
`,ia=`
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
`,sa=`
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
`;function na({settings:a,trainRef:r,onTelemetry:c,onGpuError:u}){const{gl:m}=ye(),i=S.useRef(null),y=S.useRef(null),p=S.useRef(null),n=S.useRef(a),f=S.useRef(c),b=S.useRef(0),X=S.useRef({position:null,velocity:null}),w=S.useRef(81.5);n.current=a,f.current=c;const R=a.particleCount,h=Math.ceil(Math.sqrt(R)),x=S.useMemo(()=>{const g=new je(.5,10,8);return g.setAttribute("aSimulationUv",new Pe(Fe(h,R),2)),g},[R,h]),P=S.useMemo(()=>new we({uniforms:{uPositionTex:{value:null},uVelocityTex:{value:null},uParticleDiameter:{value:v.particleDiameter},uParticleMagnitudeScale:{value:v.particleMagnitudeScale},uParticleOpacity:{value:v.particleAppearance.opacity},uCoolColor:{value:new re("#3a9bb4")},uWarmColor:{value:new re("#f0a23a")},uHotColor:{value:new re("#f45b4f")}},vertexShader:ia,fragmentShader:sa,transparent:!0,depthWrite:!1,blending:Ce}),[R]);return S.useEffect(()=>{let g;try{const E=V(n.current.stairSurfaceOpeningHeight),l=De({gl:m,resolution:h,positionShader:ra,velocityShader:oa,initialize:({particleIndex:d,positionData:z,velocityData:Y,offset:N})=>{const A=d%Le===0;z[N]=L.lerp(C.minX,C.maxX,Math.random()),z[N+1]=A?Be(d,R,E.streetY):L.lerp(fe.minY,fe.maxY,Math.random()),z[N+2]=L.lerp(C.minZ,C.maxZ,Math.random()),z[N+3]=A?2+Ze(d,R)*.999:1,Y[N]=0,Y[N+1]=0,Y[N+2]=0,Y[N+3]=0}});g=l.gpuCompute;const{positionVariable:j,velocityVariable:s}=l;j.material.uniforms.uDt={value:.016},j.material.uniforms.uRoofPitch={value:L.degToRad(v.roofPitch)},j.material.uniforms.uRoofOffset={value:v.roofOffset},j.material.uniforms.uRoofGapHorizontal={value:v.roofGapHorizontal},j.material.uniforms.uRoofGapVertical={value:v.roofGapVertical},j.material.uniforms.uStairTunnelHeight={value:v.stairUndergroundOpeningHeight},j.material.uniforms.uStairLandingY={value:v.stairLandingHeight},j.material.uniforms.uStairSurfaceY={value:v.stairSurfaceOpeningHeight},j.material.uniforms.uStreetY={value:V(v.stairSurfaceOpeningHeight).streetY},j.material.uniforms.uSurfaceFloorY={value:V(v.stairSurfaceOpeningHeight).surfaceParticleFloorY},j.material.uniforms.uClerestoryOpen={value:v.clerestoryOpen},j.material.uniforms.uClerestoryWindows={value:v.clerestoryWindows},j.material.uniforms.uFloodTunnels={value:v.floodTunnels},s.material.uniforms.uDt={value:.016},s.material.uniforms.uSurfaceTemperature={value:v.surfaceTemperature},s.material.uniforms.uRoadSurfaceTemperature={value:v.roadSurfaceTemperature},s.material.uniforms.uAmbientAirTemperature={value:v.ambientAirTemperature},s.material.uniforms.uPassengerHeat={value:v.passengerHeat},s.material.uniforms.uSurfaceCrosswind={value:v.surfaceCrosswind},s.material.uniforms.uRadius={value:.85},s.material.uniforms.uRestDensity={value:v.density},s.material.uniforms.uStiffness={value:v.stiffness},s.material.uniforms.uViscosity={value:v.viscosity},s.material.uniforms.uFluidModel={value:me(v.constitutiveModel)},s.material.uniforms.uConstitutiveStrength={value:v.constitutiveStrength},s.material.uniforms.uConstitutiveSpeedLimit={value:v.constitutiveSpeedLimit},s.material.uniforms.uTrainPosX={value:0},s.material.uniforms.uTrainVelX={value:0},s.material.uniforms.uShaftExchange={value:v.shaftExchange},s.material.uniforms.uShaftControls={value:new B(...v.shaftControls)},s.material.uniforms.uShaftFanVelocity={value:v.shaftFanVelocity},s.material.uniforms.uDownFans={value:v.downFans},s.material.uniforms.uFloorAirMovers={value:v.floorAirMovers},s.material.uniforms.uCeilingFans={value:v.ceilingFans},s.material.uniforms.uGrooves={value:v.grooves},s.material.uniforms.uFloodFlow={value:v.floodFlow},s.material.uniforms.uFloodPumpDirection={value:v.floodPumpDirection},s.material.uniforms.uRoofPitch={value:L.degToRad(v.roofPitch)},s.material.uniforms.uRoofOffset={value:v.roofOffset},s.material.uniforms.uRoofGapHorizontal={value:v.roofGapHorizontal},s.material.uniforms.uRoofGapVertical={value:v.roofGapVertical},s.material.uniforms.uClerestoryOpen={value:v.clerestoryOpen},s.material.uniforms.uClerestoryWindows={value:v.clerestoryWindows},s.material.uniforms.uStackEffect={value:v.stackEffect},s.material.uniforms.uStairTunnelHeight={value:v.stairUndergroundOpeningHeight},s.material.uniforms.uStairLandingY={value:v.stairLandingHeight},s.material.uniforms.uStairSurfaceY={value:v.stairSurfaceOpeningHeight},s.material.uniforms.uStreetY={value:V(v.stairSurfaceOpeningHeight).streetY},s.material.uniforms.uStreetMaxY={value:V(v.stairSurfaceOpeningHeight).streetMaxY},s.material.uniforms.uSurfaceFloorY={value:V(v.stairSurfaceOpeningHeight).surfaceParticleFloorY},s.material.uniforms.uShaftOutletY={value:V(v.stairSurfaceOpeningHeight).shaftOutletY},s.material.uniforms.uTrainActive={value:!0},s.material.uniforms.uShaftFans={value:v.shaftFans},s.material.uniforms.uAcActive={value:!0},s.material.uniforms.uBrakesActive={value:!0},s.material.uniforms.uFloodTunnels={value:!0},s.material.uniforms.uWindOcclusion={value:v.windOcclusion};const I=g.init();if(I)throw new Error(I);i.current=g,y.current=j,p.current=s}catch(E){u(E instanceof Error?E.message:"GPU simulation could not initialize.")}return()=>{i.current=null,y.current=null,p.current=null,g?.dispose(),x.dispose(),P.dispose()}},[m,u,x,P]),J((g,E)=>{const l=i.current,j=y.current,s=p.current;if(!l||!j||!s)return;const I=Math.min(E,.033),d=n.current,z=V(d.stairSurfaceOpeningHeight),Y=We(g.clock.elapsedTime,d.trainInterval,d.train,d.trainStopFrequency,d.trainStopDuration);r.current&&(r.current.position.x=Y.positionX,r.current.visible=Y.active),j.material.uniforms.uDt.value=I,j.material.uniforms.uRoofPitch.value=L.degToRad(d.roofPitch),j.material.uniforms.uRoofOffset.value=d.roofOffset,j.material.uniforms.uRoofGapHorizontal.value=d.roofGapHorizontal,j.material.uniforms.uRoofGapVertical.value=d.roofGapVertical,j.material.uniforms.uStairTunnelHeight.value=d.stairUndergroundOpeningHeight,j.material.uniforms.uStairLandingY.value=d.stairLandingHeight,j.material.uniforms.uStairSurfaceY.value=d.stairSurfaceOpeningHeight,j.material.uniforms.uStreetY.value=z.streetY,j.material.uniforms.uSurfaceFloorY.value=z.surfaceParticleFloorY,j.material.uniforms.uClerestoryOpen.value=d.clerestoryOpen,j.material.uniforms.uClerestoryWindows.value=d.clerestoryWindows,j.material.uniforms.uFloodTunnels.value=d.floodTunnels,s.material.uniforms.uDt.value=I,s.material.uniforms.uSurfaceTemperature.value=d.surfaceTemperature,s.material.uniforms.uRoadSurfaceTemperature.value=d.roadSurfaceTemperature,s.material.uniforms.uAmbientAirTemperature.value=d.ambientAirTemperature,s.material.uniforms.uPassengerHeat.value=d.passengerHeat,s.material.uniforms.uSurfaceCrosswind.value=d.surfaceCrosswind,s.material.uniforms.uRestDensity.value=d.density,s.material.uniforms.uStiffness.value=d.stiffness,s.material.uniforms.uViscosity.value=d.viscosity,s.material.uniforms.uFluidModel.value=me(d.constitutiveModel),s.material.uniforms.uConstitutiveStrength.value=d.constitutiveStrength,s.material.uniforms.uConstitutiveSpeedLimit.value=d.constitutiveSpeedLimit,s.material.uniforms.uTrainPosX.value=Y.positionX,s.material.uniforms.uTrainVelX.value=Y.velocityX,s.material.uniforms.uShaftExchange.value=d.shaftExchange,s.material.uniforms.uShaftControls.value.fromArray(d.shaftControls),s.material.uniforms.uShaftFanVelocity.value=d.shaftFanVelocity,s.material.uniforms.uDownFans.value=d.downFans,s.material.uniforms.uFloorAirMovers.value=d.floorAirMovers,s.material.uniforms.uCeilingFans.value=d.ceilingFans,s.material.uniforms.uGrooves.value=d.grooves,s.material.uniforms.uFloodFlow.value=d.floodFlow,s.material.uniforms.uFloodPumpDirection.value=d.floodPumpDirection,s.material.uniforms.uRoofPitch.value=L.degToRad(d.roofPitch),s.material.uniforms.uRoofOffset.value=d.roofOffset,s.material.uniforms.uRoofGapHorizontal.value=d.roofGapHorizontal,s.material.uniforms.uRoofGapVertical.value=d.roofGapVertical,s.material.uniforms.uClerestoryOpen.value=d.clerestoryOpen,s.material.uniforms.uClerestoryWindows.value=d.clerestoryWindows,s.material.uniforms.uStackEffect.value=d.stackEffect,s.material.uniforms.uStairTunnelHeight.value=d.stairUndergroundOpeningHeight,s.material.uniforms.uStairLandingY.value=d.stairLandingHeight,s.material.uniforms.uStairSurfaceY.value=d.stairSurfaceOpeningHeight,s.material.uniforms.uStreetY.value=z.streetY,s.material.uniforms.uStreetMaxY.value=z.streetMaxY,s.material.uniforms.uSurfaceFloorY.value=z.surfaceParticleFloorY,s.material.uniforms.uShaftOutletY.value=z.shaftOutletY,s.material.uniforms.uTrainActive.value=Y.active,s.material.uniforms.uShaftFans.value=d.shaftFans,s.material.uniforms.uAcActive.value=d.ac&&Y.active,s.material.uniforms.uBrakesActive.value=d.brakes&&Y.active,s.material.uniforms.uFloodTunnels.value=d.floodTunnels,s.material.uniforms.uWindOcclusion.value=d.windOcclusion,l.compute();const N=l.getCurrentRenderTarget(j),A=l.getCurrentRenderTarget(s);if(P.uniforms.uPositionTex.value=N.texture,P.uniforms.uVelocityTex.value=A.texture,P.uniforms.uParticleDiameter.value=d.particleDiameter,P.uniforms.uParticleMagnitudeScale.value=d.particleMagnitudeScale,P.uniforms.uParticleOpacity.value=d.particleAppearance.opacity,b.current+=I,b.current>.4){let k=d.ambientAirTemperature;k+=(d.roadSurfaceTemperature-d.ambientAirTemperature)*.22,k+=d.passengerHeat*1.4,d.ac&&(k+=4.5),d.brakes&&Y.active&&Math.abs(Y.positionX)<2&&(k+=3.2),Y.active&&(k-=2),w.current+=(k-w.current)*.05+(Math.random()-.5)*.35;const te=h*h*4;X.current.position?.length!==te&&(X.current={position:new Float32Array(te),velocity:new Float32Array(te)}),m.readRenderTargetPixels(N,0,0,h,h,X.current.position),m.readRenderTargetPixels(A,0,0,h,h,X.current.velocity),f.current({temperature:w.current,shafts:Ue(X.current.position,X.current.velocity,R,z.streetY)}),b.current=0}}),e.jsx("instancedMesh",{args:[x,P,R],frustumCulled:!1})}const la=S.forwardRef(function({active:r,brakes:c},u){const m=S.useRef(),i=[S.useRef(),S.useRef()],y=[S.useRef(),S.useRef()];return J(()=>{i.forEach(n=>{r&&(n.current.rotation.y+=.3)});const p=c&&u.current&&Math.abs(u.current.position.x)<2;m.current&&(m.current.position.y=p?-1.8+(Math.random()-.5)*.04:-1.8),y.forEach(n=>{n.current.intensity=p?4+Math.random()*5:0})}),e.jsxs("group",{ref:u,children:[e.jsxs("mesh",{ref:m,position:[0,-1.8,2.5],castShadow:!0,children:[e.jsx("boxGeometry",{args:[16,3.4,2.8]}),e.jsx("meshStandardMaterial",{color:"#b7c7c5",metalness:.82,roughness:.25})]}),[1.06,3.94].map(p=>e.jsxs("group",{children:[[-6.2,-1.7,1.7,6.2].map(n=>e.jsxs("mesh",{position:[n,-1.5,p],children:[e.jsx("boxGeometry",{args:[1.55,1.1,.05]}),e.jsx("meshStandardMaterial",{color:"#17333a",metalness:.4,roughness:.18,emissive:"#0d6872",emissiveIntensity:.35})]},n)),[-4,4].map(n=>e.jsxs("group",{position:[n,-1.8,p],children:[[-.59,.59].map(f=>e.jsxs("group",{position:[f,0,0],children:[e.jsxs("mesh",{children:[e.jsx("boxGeometry",{args:[1.14,2.75,.06]}),e.jsx("meshStandardMaterial",{color:"#8fa3a2",metalness:.75,roughness:.3})]}),e.jsxs("mesh",{position:[0,.55,p<2.5?-.04:.04],children:[e.jsx("boxGeometry",{args:[.78,.88,.035]}),e.jsx("meshStandardMaterial",{color:"#17333a",metalness:.4,roughness:.18,emissive:"#0d6872",emissiveIntensity:.3})]})]},f)),e.jsxs("mesh",{position:[0,0,p<2.5?-.04:.04],children:[e.jsx("boxGeometry",{args:[.045,2.75,.035]}),e.jsx("meshStandardMaterial",{color:"#263638",metalness:.55,roughness:.4})]})]},n))]},p)),[-4,4].map((p,n)=>e.jsxs("group",{children:[e.jsxs("mesh",{position:[p,.1,2.5],children:[e.jsx("boxGeometry",{args:[2.5,.4,1.8]}),e.jsx("meshStandardMaterial",{color:"#33484b",roughness:.8})]}),e.jsxs("mesh",{ref:i[n],position:[p,.35,2.5],children:[e.jsx("boxGeometry",{args:[1.4,.05,.2]}),e.jsx("meshStandardMaterial",{color:"#192427",roughness:.8})]})]},p)),[-6,6].map((p,n)=>e.jsx("pointLight",{ref:y[n],color:"#ff493d",distance:7,position:[p,-3,3.5]},p))]})}),ca=[-2.4,-.8,.8,2.4];function ua({settings:a}){const r=S.useRef([]),c=S.useRef([]),u=S.useRef([]),m=L.degToRad(a.roofPitch),i=a.roofOffset,y=4+Math.tan(m)*2.3,p=Math.max(0,a.roofGapHorizontal),n=Math.max(.05,a.roofGapVertical),{streetY:f}=V(a.stairSurfaceOpeningHeight),{leftEndZ:b,rightStartZ:X}=ea(i,p),w=[...ae(-11,11,-4.6,b),...ae(-11,11,X,4.6)].map(x=>{const P=ue(x.startZ,a.roofPitch,i,n),g=ue(x.endZ,a.roofPitch,i,n);return{...x,centerX:(x.startX+x.endX)/2,centerY:(P+g)/2,centerZ:(x.startZ+x.endZ)/2,length:Math.hypot(x.endZ-x.startZ,g-P),rotation:Math.atan2(-(g-P),x.endZ-x.startZ)}}),R=Math.hypot(p,n),h=-Math.atan2(n,p);return J((x,P)=>{r.current.forEach(g=>{g&&(g.rotation.x+=P*(2+a.ceilingFans*5))}),c.current.forEach(g=>{g&&(g.rotation.x+=P*(1.5+a.floorAirMovers*6))}),u.current.forEach((g,E)=>{g&&a.shaftFans&&(g.rotation.y+=P*a.shaftFanVelocity*a.shaftControls[E]*5)})}),e.jsxs("group",{children:[e.jsx("group",{children:q.map((x,P)=>e.jsxs("group",{position:[x,0,-1.4],children:[e.jsxs("mesh",{position:[0,(H.throatY+f)/2,0],children:[e.jsx("boxGeometry",{args:[1.25,f-H.throatY,1.25]}),e.jsx("meshStandardMaterial",{color:"#708b82",metalness:.45,roughness:.55,transparent:!0,opacity:.18,depthWrite:!1})]}),e.jsxs("mesh",{position:[0,f,0],children:[e.jsx("boxGeometry",{args:[1.5,.12,1.5]}),e.jsx("meshStandardMaterial",{color:"#d5b75e",metalness:.7,roughness:.3,transparent:!0,opacity:.65})]}),[-.48,-.24,0,.24,.48].map(g=>e.jsxs("mesh",{position:[0,f+.08,g],children:[e.jsx("boxGeometry",{args:[1.2,.06,.1]}),e.jsx("meshStandardMaterial",{color:"#203b3d",metalness:.78,roughness:.28})]},g)),e.jsxs("mesh",{position:[0,H.throatY,0],children:[e.jsx("boxGeometry",{args:[1.05,.08,1.05]}),e.jsx("meshStandardMaterial",{color:"#1d3536",metalness:.35,roughness:.45})]}),e.jsxs("group",{ref:g=>{u.current[P]=g},position:[0,H.throatY+.14,0],children:[e.jsxs("mesh",{children:[e.jsx("cylinderGeometry",{args:[.46,.46,.08,16]}),e.jsx("meshStandardMaterial",{color:a.shaftFans?"#63b6b1":"#49615e",metalness:.55,roughness:.3})]}),e.jsxs("mesh",{position:[0,.06,0],children:[e.jsx("boxGeometry",{args:[.86,.035,.08]}),e.jsx("meshBasicMaterial",{color:a.shaftFans?"#bce8d5":"#708b82"})]}),e.jsxs("mesh",{position:[0,.06,0],rotation:[0,Math.PI/2,0],children:[e.jsx("boxGeometry",{args:[.86,.035,.08]}),e.jsx("meshBasicMaterial",{color:a.shaftFans?"#bce8d5":"#708b82"})]})]})]},x))}),e.jsx("group",{children:[-6,0,6].map((x,P)=>e.jsxs("group",{ref:g=>{r.current[P]=g},position:[x,3.48,1.4],rotation:[0,0,Math.PI/2],children:[e.jsxs("mesh",{children:[e.jsx("cylinderGeometry",{args:[.42,.42,.14,16]}),e.jsx("meshStandardMaterial",{color:"#63b6b1",emissive:"#165d61",emissiveIntensity:.3,metalness:.55,roughness:.3})]}),e.jsxs("mesh",{position:[0,.05,0],children:[e.jsx("boxGeometry",{args:[.75,.035,.06]}),e.jsx("meshBasicMaterial",{color:"#bce8d5"})]}),e.jsxs("mesh",{position:[0,.05,0],rotation:[0,Math.PI/2,0],children:[e.jsx("boxGeometry",{args:[.75,.035,.06]}),e.jsx("meshBasicMaterial",{color:"#bce8d5"})]})]},x))}),e.jsx("group",{children:D.fanPositions.map((x,P)=>e.jsxs("group",{ref:g=>{c.current[P]=g},position:[x,-2.34,D.floorMoverZ],rotation:[0,0,Math.PI/2],children:[e.jsxs("mesh",{children:[e.jsx("cylinderGeometry",{args:[.42,.42,.14,16]}),e.jsx("meshStandardMaterial",{color:"#d5b75e",emissive:"#7a5421",emissiveIntensity:.35,metalness:.65,roughness:.3})]}),e.jsxs("mesh",{position:[0,.05,0],children:[e.jsx("boxGeometry",{args:[.72,.035,.06]}),e.jsx("meshBasicMaterial",{color:"#f0d38a"})]}),e.jsxs("mesh",{position:[0,.05,0],rotation:[0,Math.PI/2,0],children:[e.jsx("boxGeometry",{args:[.72,.035,.06]}),e.jsx("meshBasicMaterial",{color:"#f0d38a"})]})]},x))}),e.jsx("group",{children:ca.map((x,P)=>e.jsxs("mesh",{position:[0,3.95,x],rotation:[0,0,P%2?-.018:.018],children:[e.jsx("boxGeometry",{args:[20,.07,.12]}),e.jsx("meshStandardMaterial",{color:"#254546",emissive:"#1d5d58",emissiveIntensity:.25,roughness:.72})]},x))}),e.jsxs("group",{children:[w.map(x=>e.jsxs("mesh",{position:[x.centerX,x.centerY,x.centerZ],rotation:[x.rotation,0,0],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[x.endX-x.startX,.22,Math.max(.2,x.length)]}),e.jsx("meshStandardMaterial",{color:"#607974",roughness:.78,metalness:.18})]},`${x.startX}:${x.endX}:${x.startZ}:${x.endZ}`)),e.jsx("group",{visible:a.clerestoryWindows,position:[0,y+n/2,i],children:Array.from({length:10},(x,P)=>e.jsxs("mesh",{position:[-9+P*2,0,0],rotation:[h,0,0],children:[e.jsx("boxGeometry",{args:[1.7,.08,R]}),e.jsx("meshStandardMaterial",{color:"#9bdfe1",emissive:"#2f8e83",emissiveIntensity:.2+a.clerestoryOpen*.7,transparent:!0,opacity:.18+a.clerestoryOpen*.42,metalness:.18,roughness:.25})]},P))}),e.jsxs("mesh",{position:[9.65,4.1,0],children:[e.jsx("boxGeometry",{args:[.12,.45,5.8]}),e.jsx("meshBasicMaterial",{color:"#9bd1aa"})]})]})]})}function de(a,r,c,u){const m=new ne;m.moveTo(a[0].startX,a[0].startY+r),a.forEach(y=>m.lineTo(y.endX,y.endY+r)),m.lineTo(a.at(-1).endX,a.at(-1).endY+c),[...a].reverse().forEach(y=>m.lineTo(y.startX,y.startY+c)),m.closePath();const i=u==null?new Re(m):new le(m,{depth:u,bevelEnabled:!1});return u!=null&&i.translate(0,0,o.z-u/2),i}function fa(a,r){const c=new ne;c.moveTo(a[0].startX,r),c.lineTo(a.at(-1).endX,r),c.lineTo(a.at(-1).endX,a.at(-1).endY-.2),[...a].reverse().forEach(m=>c.lineTo(m.startX,m.startY-.2)),c.closePath();const u=new le(c,{depth:o.width,bevelEnabled:!1});return u.translate(0,0,o.z-o.width/2),u}function ma(a,r,c){const u=new ne;u.moveTo(o.landingStartX,o.baseY),u.lineTo(o.endX,o.baseY),u.lineTo(o.endX,c+a),u.lineTo(o.upperFlightStartX,r+a),u.lineTo(o.lowerFlightEndX,r+a),u.lineTo(o.startX,o.baseY+a),u.lineTo(o.landingStartX,o.baseY+a),u.closePath();const m=_.stairOuterZ-C.minZ,i=new le(u,{depth:m,bevelEnabled:!1});return i.translate(0,0,C.minZ),i}function pa({tunnelHeight:a,landingY:r,surfaceY:c}){const u=F.maxX-F.minX,m=(F.minX+F.maxX)/2,i=F.bedY-.2-C.minY,y=o.endX-o.landingStartX,p=(o.endX+o.landingStartX)/2,n=o.baseY-.2-C.minY,f=S.useMemo(()=>ma(a,r,c),[a,r,c]);return S.useEffect(()=>()=>f.dispose(),[f]),e.jsxs("group",{children:[e.jsxs("mesh",{position:[m,C.minY+i/2,F.centerZ],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[u,i,F.tunnelWidth]}),e.jsx("meshStandardMaterial",{color:"#33403f",roughness:.98})]}),e.jsxs("mesh",{position:[p,C.minY+n/2,o.z],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[y,n,o.width]}),e.jsx("meshStandardMaterial",{color:"#46514e",roughness:.98})]}),e.jsx("mesh",{geometry:f,receiveShadow:!0,children:e.jsx("meshStandardMaterial",{color:"#596763",transparent:!0,opacity:.09,depthWrite:!1,side:K,roughness:.95})})]})}function da({tunnelHeight:a,landingY:r,surfaceY:c}){const u=o.startX-o.landingStartX,m=(o.landingStartX+o.startX)/2,i=[{id:"lower",startX:o.startX,endX:o.lowerFlightEndX,startY:o.baseY,endY:r},{id:"landing",startX:o.lowerFlightEndX,endX:o.upperFlightStartX,startY:r,endY:r},{id:"upper",startX:o.upperFlightStartX,endX:o.endX,startY:r,endY:c}].map(n=>({...n,centerX:(n.startX+n.endX)/2,centerY:(n.startY+n.endY)/2,length:Math.hypot(n.endX-n.startX,n.endY-n.startY),angle:Math.atan2(n.endY-n.startY,n.endX-n.startX)})),y=S.useMemo(()=>({underfill:fa(i,o.baseY-.2),wall:de(i,0,a),ceiling:de(i,a-.04,a+.04,o.width)}),[r,c,a]);S.useEffect(()=>()=>Object.values(y).forEach(n=>n.dispose()),[y]);const p={color:"#9bd1c1",emissive:"#2f8e83",emissiveIntensity:.18,transparent:!0,opacity:.11,depthWrite:!1,side:K};return e.jsxs("group",{children:[e.jsx("mesh",{geometry:y.underfill,receiveShadow:!0,children:e.jsx("meshStandardMaterial",{color:"#596763",transparent:!0,opacity:.09,depthWrite:!1,side:K,roughness:.95})}),e.jsxs("mesh",{position:[m,o.baseY+a,o.z],children:[e.jsx("boxGeometry",{args:[u,.08,o.width]}),e.jsx("meshStandardMaterial",{...p})]}),[-1,1].map(n=>e.jsxs("mesh",{position:[m,o.baseY+a/2,o.z+n*o.width/2],children:[e.jsx("boxGeometry",{args:[u,a,.08]}),e.jsx("meshStandardMaterial",{...p})]},`entry-${n}`)),e.jsx("mesh",{geometry:y.ceiling,children:e.jsx("meshStandardMaterial",{...p})}),[-1,1].map(n=>e.jsx("mesh",{geometry:y.wall,position:[0,0,o.z+n*o.width/2],children:e.jsx("meshStandardMaterial",{...p})},n))]})}function ha(){return e.jsx("group",{children:O.pedestalZ.map(a=>e.jsxs("group",{position:[O.x,o.baseY,a],children:[e.jsxs("mesh",{position:[0,O.pedestalHeight/2,0],castShadow:!0,receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[O.halfDepth*2,O.pedestalHeight,O.pedestalHalfWidth*2]}),e.jsx("meshStandardMaterial",{color:"#324b50",metalness:.72,roughness:.3})]}),e.jsxs("mesh",{position:[0,O.pedestalHeight+.05,0],children:[e.jsx("boxGeometry",{args:[.48,.12,.32]}),e.jsx("meshStandardMaterial",{color:"#79c9bb",emissive:"#1d706b",emissiveIntensity:.45,metalness:.45,roughness:.28})]}),e.jsx("group",{position:[.28,.72,0],rotation:[Math.PI/2,0,0],children:[0,Math.PI*2/3,Math.PI*4/3].map(r=>e.jsxs("mesh",{position:[Math.cos(r)*.3,Math.sin(r)*.3,0],rotation:[0,0,r],children:[e.jsx("boxGeometry",{args:[.62,.055,.055]}),e.jsx("meshStandardMaterial",{color:"#c8d5cf",metalness:.9,roughness:.18})]},r))})]},a))})}function xa({tunnelHeight:a,landingY:r,surfaceY:c}){const{streetY:u}=V(c),m=G.maxX-G.minX,i=(G.minX+G.maxX)/2,y=aa(r,c,a),p=ae(G.minX,y,G.minZ,Q.sidewalkRoadEdgeZ,q,H.z,Q.shaftApertureSize),n=Q.sidewalkRoadEdgeZ,f=G.maxZ-n,b=(n+G.maxZ)/2,X=4.8,w=u-X,R=ae(-11,9,G.minZ,G.maxZ);return e.jsxs("group",{children:[R.map(h=>e.jsxs("mesh",{position:[(h.startX+h.endX)/2,X+w/2,(h.startZ+h.endZ)/2],children:[e.jsx("boxGeometry",{args:[h.endX-h.startX,w,h.endZ-h.startZ]}),e.jsx("meshStandardMaterial",{color:"#596763",transparent:!0,opacity:.07,depthWrite:!1,side:K,roughness:.95})]},`insulation:${h.startX}:${h.endX}:${h.startZ}:${h.endZ}`)),e.jsxs("mesh",{position:[i,u-.09,b],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[m,.18,f]}),e.jsx("meshStandardMaterial",{color:"#273238",roughness:.96,metalness:.02})]}),p.map(h=>e.jsxs("mesh",{position:[(h.startX+h.endX)/2,u,(h.startZ+h.endZ)/2],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[h.endX-h.startX,.2,h.endZ-h.startZ]}),e.jsx("meshStandardMaterial",{color:"#7d8582",roughness:.88,metalness:.04})]},`${h.startX}:${h.endX}:${h.startZ}:${h.endZ}`)),e.jsxs("mesh",{position:[i,u+.08,n+.07],children:[e.jsx("boxGeometry",{args:[m,.24,.14]}),e.jsx("meshStandardMaterial",{color:"#c4c8bd",roughness:.78})]}),[0,4.2].map(h=>e.jsxs("mesh",{position:[i,u+.015,h],children:[e.jsx("boxGeometry",{args:[m-1,.025,.1]}),e.jsx("meshBasicMaterial",{color:"#eef0df"})]},h)),Array.from({length:14},(h,x)=>e.jsxs("mesh",{position:[G.minX+2+x*3.4,u+.02,1.8],children:[e.jsx("boxGeometry",{args:[1.8,.03,.12]}),e.jsx("meshBasicMaterial",{color:"#e8b941"})]},x))]})}function ya({enabled:a,flow:r,pumpDirection:c}){const u=S.useRef([]),m=S.useRef([]),i=M.maxX-M.minX,y=(M.minX+M.maxX)/2;return J((p,n)=>{!a||r<=0||(u.current.forEach(f=>{f&&(f.position.x+=n*c*(1.5+r*5),f.position.x>M.maxX&&(f.position.x=M.minX),f.position.x<M.minX&&(f.position.x=M.maxX))}),m.current.forEach(f=>{f&&(f.position.y-=n*(1.5+r*4),f.position.y<$.bottomY&&(f.position.y=$.topY))}))}),e.jsxs("group",{visible:a,children:[e.jsxs("mesh",{position:[y,M.y,M.z],rotation:[0,0,Math.PI/2],children:[e.jsx("cylinderGeometry",{args:[M.radius,M.radius,i,24,1,!0]}),e.jsx("meshStandardMaterial",{color:"#15383e",side:be,roughness:.9,metalness:.1,transparent:!0,opacity:.82})]}),e.jsxs("mesh",{position:[y,-6.08,M.z],children:[e.jsx("boxGeometry",{args:[i-.5,.05,1.6]}),e.jsx("meshStandardMaterial",{color:"#21727a",emissive:"#0c4249",emissiveIntensity:.35+r*.45,roughness:.25,metalness:.12})]}),[M.minX,M.maxX].map(p=>e.jsxs("mesh",{position:[p,-5,-4.15],rotation:[0,Math.PI/2,0],children:[e.jsx("torusGeometry",{args:[1.25,.1,12,28]}),e.jsx("meshStandardMaterial",{color:"#d5b75e",metalness:.7,roughness:.34})]},p)),e.jsxs("mesh",{position:[y,-5.72,M.z],rotation:[0,c<0?Math.PI:0,0],children:[e.jsx("boxGeometry",{args:[4.5,.08,.1]}),e.jsx("meshBasicMaterial",{color:"#9bd1aa"})]}),e.jsx("group",{visible:r>0,children:Array.from({length:18},(p,n)=>e.jsxs("mesh",{ref:f=>{u.current[n]=f},position:[M.minX+(n+.5)*i/18,-5.35,M.z],children:[e.jsx("sphereGeometry",{args:[.09+r*.06,8,6]}),e.jsx("meshBasicMaterial",{color:"#77e6e8",transparent:!0,opacity:.45+r*.5})]},n))}),e.jsx("pointLight",{color:"#48cbd1",intensity:.4+r*1.4,distance:7,position:[0,-5.2,-4.15]}),e.jsxs("group",{visible:r>0,children:[e.jsxs("mesh",{position:[$.x,($.topY+$.bottomY)/2,$.z],children:[e.jsx("boxGeometry",{args:[1.35,$.topY-$.bottomY,.06]}),e.jsx("meshStandardMaterial",{color:"#68d9e1",emissive:"#167782",emissiveIntensity:.7+r,transparent:!0,opacity:.12+r*.28,roughness:.18})]}),Array.from({length:12},(p,n)=>e.jsxs("mesh",{ref:f=>{m.current[n]=f},position:[$.x-.55+n%4*.36,$.topY-n%6*.45,$.z+.04],children:[e.jsx("sphereGeometry",{args:[.07+r*.04,7,5]}),e.jsx("meshBasicMaterial",{color:"#a4f4f0",transparent:!0,opacity:.55+r*.4})]},n)),e.jsx("pointLight",{color:"#55dce2",intensity:.5+r*1.8,distance:6,position:[$.x,-4,$.z]})]})]})}function va({landingY:a,surfaceY:r}){const c=e.jsx("meshStandardMaterial",{color:"#52646a",roughness:.88}),u=F.maxX-F.minX,m=(F.minX+F.maxX)/2,i=F.bedY+F.tunnelHeight/2,y=[{startX:o.startX,endX:o.lowerFlightEndX,startY:o.baseY,endY:a,count:o.lowerStepCount},{startX:o.upperFlightStartX,endX:o.endX,startY:a,endY:r,count:o.upperStepCount}],p=o.startX-o.landingStartX,n=o.topLandingEndX-o.endX;return e.jsxs("group",{children:[e.jsxs("mesh",{position:[0,ce-.75,-2.5],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[22,1.5,4]}),c]}),e.jsxs("mesh",{position:[0,ce+.02,-.6],children:[e.jsx("boxGeometry",{args:[22,.05,.3]}),e.jsx("meshBasicMaterial",{color:"#e5bd42"})]}),e.jsxs("mesh",{position:[m,F.bedY,F.centerZ],receiveShadow:!0,children:[e.jsx("boxGeometry",{args:[u,.4,F.width]}),e.jsx("meshStandardMaterial",{color:"#111e21",roughness:.95})]}),[-1.5,0,1.5].map(f=>e.jsxs("mesh",{position:[m,F.bedY+.25,F.centerZ+f],children:[e.jsx("boxGeometry",{args:[u,.08,.08]}),e.jsx("meshStandardMaterial",{color:"#b3c3bf",metalness:.9,roughness:.22})]},f)),e.jsxs("mesh",{position:[m,i,F.centerZ],children:[e.jsx("boxGeometry",{args:[u,F.tunnelHeight,F.tunnelWidth]}),e.jsx("meshStandardMaterial",{color:"#8fb8b5",transparent:!0,opacity:.035,depthWrite:!1,side:K,roughness:.2,metalness:.08})]}),e.jsxs("mesh",{position:[(o.landingStartX+o.startX)/2,o.baseY-.1,o.z],children:[e.jsx("boxGeometry",{args:[p,.2,o.width]}),c]}),e.jsxs("mesh",{position:[(o.lowerFlightEndX+o.upperFlightStartX)/2,a-.1,o.z],children:[e.jsx("boxGeometry",{args:[o.upperFlightStartX-o.lowerFlightEndX,.2,o.width]}),c]}),e.jsxs("mesh",{position:[o.endX+n/2,r-.1,o.z],children:[e.jsx("boxGeometry",{args:[n,.2,o.width]}),c]}),y.flatMap(f=>{const b=(f.endX-f.startX)/f.count;return Array.from({length:f.count},(X,w)=>{const R=f.startX+(w+.5)*b,h=Je(R,o.baseY,a,r);return e.jsxs("mesh",{position:[R,h-.1,o.z],children:[e.jsx("boxGeometry",{args:[b+o.nosingDepth,.2,o.width]}),c]},`${f.startX}:${w}`)})}),[-8,-4,0,4].map(f=>e.jsxs("mesh",{position:[f,.5,-.6],children:[e.jsx("boxGeometry",{args:[.3,7,.3]}),e.jsx("meshStandardMaterial",{color:"#235160",metalness:.6,roughness:.36})]},f)),ve.map((f,b)=>e.jsxs("mesh",{position:[f.x,f.y,f.z],children:[e.jsx("cylinderGeometry",{args:[.18,.18,1.5,8]}),e.jsx("meshStandardMaterial",{color:b%2?"#384f55":"#23363c",roughness:.86})]},b))]})}function ga({viewMode:a,orbitalPlaying:r,orbitSettings:c,parametersVisible:u,onManualChange:m}){const{camera:i,gl:y,size:p}=ye(),n=S.useRef(),f=S.useRef(new B(...se.find(g=>g.id==="ortho1").position)),b=S.useRef(new B(...ee)),X=S.useRef(null),w=S.useRef(new B),R=S.useRef(new B),h=S.useRef(!1),x=S.useRef(m);x.current=m,S.useEffect(()=>{if(a==="previous"){const s=X.current;if(!s)return;h.current=!1,i.up.copy(s.up),i.zoom=s.zoom,i.fov=s.fov,i.near=s.near,i.far=s.far,i.updateProjectionMatrix(),f.current.copy(s.position),b.current.copy(s.target);return}const g=se.find(s=>s.id===a);a&&(h.current=!1),a==="orbital"&&i.up.set(0,1,0),g?.position&&(X.current={position:i.position.clone().sub(w.current),target:n.current?.target.clone()??b.current.clone(),up:i.up.clone(),zoom:i.zoom,fov:i.fov,near:i.near,far:i.far}),g?.position&&i.up.fromArray(g.up??[0,1,0]);const E=new B(...g?.position??i.position.toArray());g?.position||E.sub(w.current);const l=new B(...ee),j=pe(i,E,l,p,u);R.current.copy(j),f.current.copy(E),b.current.copy(l)},[i,u,p,a]),J((g,E)=>{if(!n.current)return;const l=1-Math.exp(-E*5.5),j=i.position.clone().sub(w.current);if(!h.current&&a&&(a!=="orbital"&&j.lerp(f.current,l),n.current.target.lerp(b.current,l)),!h.current&&a==="orbital"&&r&&c.cameraOrbitOn){const d=n.current.target,z=j.clone().sub(d),Y=Math.max(0,Number(c.replayCameraOrbitSpeed)||0)*E;z.applyEuler(new Te(Y*(c.replayCameraOrbitX||0),Y*(c.replayCameraOrbitY||0),Y*(c.replayCameraOrbitZ||0))),j.copy(d).add(z)}const s=!h.current&&a&&a!=="orbital"?f.current:j,I=pe(i,s,b.current,p,u);R.current.copy(I),w.current.lerp(R.current,l),i.position.copy(j).add(w.current)});const P=()=>{h.current=!0,x.current()};return S.useEffect(()=>{const g=()=>{h.current=!0,x.current()};return y.domElement.addEventListener("wheel",g,{capture:!0,passive:!0}),()=>y.domElement.removeEventListener("wheel",g,{capture:!0})},[y]),e.jsx(_e,{ref:n,cameraParams:{target:ee,minDistance:12,maxDistance:90,autoRotate:!1,enabled:c.cameraControlsEnabled??!0,enableZoom:c.cameraZoomEnabled&&c.cameraWheelMode==="dolly"},onStart:P})}function Sa({settings:a,viewMode:r,orbitalPlaying:c,parametersVisible:u,onManualViewChange:m,onTelemetry:i,onGpuError:y}){const p=S.useRef(),n={tunnelHeight:a.stairUndergroundOpeningHeight,landingY:a.stairLandingHeight,surfaceY:a.stairSurfaceOpeningHeight};return e.jsxs(e.Fragment,{children:[e.jsx("ambientLight",{color:"#8ab0ae",intensity:1.25}),e.jsx("directionalLight",{color:"#fff4dd",intensity:2.3,position:[10,20,15],castShadow:!0}),e.jsx(va,{...n}),e.jsx(pa,{...n}),e.jsx(ha,{}),e.jsx(ua,{settings:a}),e.jsx(da,{...n}),e.jsx(xa,{...n}),e.jsx(ya,{enabled:a.floodTunnels,flow:a.floodFlow,pumpDirection:a.floodPumpDirection}),e.jsx(la,{ref:p,active:a.train,brakes:a.brakes}),e.jsx(na,{settings:a,trainRef:p,onTelemetry:i,onGpuError:y},a.particleCount),e.jsx(Se,{position:[9,-4,0],opacity:.42,scale:56,blur:2.5,far:8}),e.jsx(ga,{viewMode:r,orbitalPlaying:c,orbitSettings:a,parametersVisible:u,onManualChange:m})]})}function ba({values:a}){const r=a.map((c,u)=>`${u/(a.length-1)*250},${60-(c-78)/14*52}`).join(" ");return e.jsxs("svg",{className:"sparkline",viewBox:"0 0 250 64",preserveAspectRatio:"none","aria-label":"Station temperature history",children:[e.jsx("path",{d:"M0 48 H250 M0 28 H250",className:"sparkline-grid"}),e.jsx("polyline",{points:r,className:"sparkline-line"})]})}function Z({parameter:a,label:r,checked:c,onChange:u,description:m,showDescription:i}){const y=a?U[a]?.description:void 0;if(a&&U[a]?.type!=="boolean")throw new TypeError(`SubwaySim toggle is missing boolean parameter metadata: ${a}`);return e.jsxs("label",{className:"toggle-row",children:[e.jsx("input",{type:"checkbox",checked:c,onChange:p=>u(p.target.checked)}),e.jsx("span",{className:"toggle-track",children:e.jsx("span",{})}),e.jsxs("span",{className:"toggle-copy",children:[e.jsx("span",{children:r}),i&&e.jsx("small",{className:"parameter-description",children:y??m})]})]})}function T({parameter:a,label:r,value:c,suffix:u,description:m,showDescription:i,onChange:y,editing:p=!1,isDefault:n=!0,onReset:f}){const b=U[a];if(!b||!["number","integer","array"].includes(b.type))throw new TypeError(`SubwaySim slider is missing numeric parameter metadata: ${a}`);const X=b.type==="array"?b.items:b,w=X.description??b.description,{minimum:R,maximum:h,step:x}=X;return e.jsx(qe,{className:"slider-control",label:r,value:Number.isFinite(c)?c:R,min:R,max:h,step:x,suffix:u,editing:p,isDefault:n,onReset:f,description:w??m,showDescription:i,onChange:y})}function he({history:a,metric:r,label:c,unit:u}){const m=a.flatMap(w=>[w?.intake?.[r],w?.outlet?.[r]]).filter(Number.isFinite),i=r==="flow"?Math.max(1,...m.map(Math.abs)):null,[y,p]=r==="flow"?[-i,i]:Qe(m),n=r==="temperature"?`${y}–${p} ${u}`:u,f=w=>r==="flow"?w===0?"0":w.toFixed(1):`${Number.isInteger(w)?w:w.toFixed(1)}°`,b=[p,(y+p)/2,y],X=w=>a.map((R,h)=>{const x=R?.[w]?.[r];if(!Number.isFinite(x))return null;const P=a.length>1?h/(a.length-1)*220:220,g=42-(x-y)/(p-y)*38;return`${P},${Math.max(2,Math.min(42,g))}`}).filter(Boolean).join(" ");return e.jsxs("div",{className:"vent-chart",children:[e.jsxs("div",{className:"vent-chart-heading",children:[e.jsx("span",{children:c}),e.jsx("span",{children:n})]}),e.jsxs("div",{className:"vent-chart-body",children:[e.jsx("div",{className:"vent-chart-y-axis","aria-hidden":"true",children:b.map(w=>e.jsx("span",{children:f(w)},w))}),e.jsxs("svg",{viewBox:"0 0 220 44",preserveAspectRatio:"none","aria-label":`${c} history`,children:[e.jsx("line",{x1:"0",y1:"2",x2:"220",y2:"2",className:"vent-chart-grid"}),e.jsx("line",{x1:"0",y1:"22",x2:"220",y2:"22",className:"vent-chart-grid"}),e.jsx("line",{x1:"0",y1:"42",x2:"220",y2:"42",className:"vent-chart-grid"}),e.jsx("polyline",{points:X("intake"),className:"vent-chart-line intake"}),e.jsx("polyline",{points:X("outlet"),className:"vent-chart-line outlet"})]})]})]})}function ja({settings:a,telemetry:r,onSettingsChange:c,showDescriptions:u}){const[m,i]=S.useState(()=>q.map(()=>[]));S.useEffect(()=>{r.shafts.length===q.length&&i(p=>p.map((n,f)=>[...n.slice(-35),r.shafts[f]]))},[r.shafts]);const y=(p,n)=>{const f=[...a.shaftControls];f[p]=n,c({shaftControls:f})};return e.jsxs("details",{className:"parameter-group vent-flow-group",children:[e.jsx("summary",{children:"Vent flow charts"}),e.jsx("div",{className:"vent-flow-list",children:q.map((p,n)=>{const f=r.shafts[n];return e.jsxs("section",{className:"vent-flow-shaft",children:[e.jsx(T,{parameter:"shaftControls",label:`${Ke[n]} shaft (${p>0?"+":""}${p} m)`,value:a.shaftControls[n],suffix:"",description:"Sets signed ventilation speed for this shaft; negative values reverse vertical flow.",showDescription:u,onChange:b=>y(n,b)}),e.jsx("div",{className:"vent-endpoints",children:["intake","outlet"].map(b=>e.jsxs("div",{className:"vent-endpoint",children:[e.jsx("span",{children:b}),e.jsx("strong",{children:Number.isFinite(f?.[b]?.flow)?`${f[b].flow.toFixed(2)} m/s`:"--"}),e.jsxs("small",{children:[Number.isFinite(f?.[b]?.temperature)?`${f[b].temperature.toFixed(1)}°F`:"--"," · n=",f?.[b]?.count??0]})]},b))}),e.jsx(he,{history:m[n],metric:"flow",label:"Vertical flow",unit:"m/s"}),e.jsx(he,{history:m[n],metric:"temperature",label:"Air temperature",unit:"°F"}),e.jsxs("div",{className:"vent-chart-legend",children:[e.jsx("span",{className:"intake",children:"Intake"}),e.jsx("span",{className:"outlet",children:"Outlet"})]})]},p)})})]})}function xe({title:a,items:r,tone:c}){const u=Math.max(...r.map(m=>m.points),1);return e.jsxs("section",{className:"report-contributions",children:[e.jsxs("div",{className:"report-section-heading",children:[e.jsx("span",{children:a}),e.jsxs("strong",{children:[r.reduce((m,i)=>m+i.points,0).toFixed(1)," pts"]})]}),e.jsx("div",{className:"contribution-list",children:r.map(m=>e.jsxs("div",{className:"contribution-row",children:[e.jsxs("div",{className:"contribution-label",children:[e.jsx("span",{children:m.label}),e.jsxs("strong",{className:`contribution-points ${c}`,children:[c==="positive"?"+":"-",m.points.toFixed(1)]})]}),e.jsx("div",{className:"contribution-track",children:e.jsx("span",{className:c,style:{width:`${m.points/u*100}%`}})}),e.jsx("small",{children:m.description})]},m.key))})]})}function Pa({report:a,onClose:r}){return e.jsx("div",{className:"report-layer",onClick:r,children:e.jsxs("section",{className:"report-screen panel",role:"dialog","aria-modal":"true","aria-labelledby":"resilience-report-title",onClick:c=>c.stopPropagation(),children:[e.jsxs("header",{className:"report-header",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"panel-kicker",children:[e.jsx("span",{className:"status-dot"}),"THERMAL RESILIENCE / FIELD REPORT"]}),e.jsx("h2",{id:"resilience-report-title",children:"What is moving the score"})]}),e.jsx("button",{className:"report-close",type:"button",onClick:r,"aria-label":"Close thermal resilience report",children:"Close"})]}),e.jsxs("div",{className:"report-score-block",children:[e.jsx("span",{children:"Current resilience"}),e.jsxs("strong",{children:[a.score,"%"]}),e.jsx("div",{className:"sustainability-meter",children:e.jsx("span",{style:{width:`${a.score}%`}})}),e.jsx("p",{children:"Higher scores favor passive heat removal and penalize powered air movement."})]}),e.jsxs("div",{className:"report-equation",children:[e.jsx("span",{children:"Baseline"}),e.jsx("strong",{children:a.baseline.toFixed(0)}),e.jsx("span",{children:"+"}),e.jsx("strong",{className:"positive-text",children:a.passiveTotal.toFixed(1)}),e.jsx("span",{children:"-"}),e.jsx("strong",{className:"negative-text",children:a.activeTotal.toFixed(1)}),e.jsx("span",{children:"="}),e.jsx("strong",{children:a.score})]}),e.jsx(xe,{title:"Passive cooling credits",items:a.passive,tone:"positive"}),e.jsx(xe,{title:"Active airflow load",items:a.active,tone:"negative"}),e.jsxs("div",{className:"report-note",children:[e.jsx("strong",{children:"Field note"}),e.jsx("span",{children:"Surface temperature changes floor buoyancy and particle heat, but remains a physical input rather than a resilience-score credit or penalty."})]})]})})}function wa({settings:a,onSettingsChange:r,telemetry:c,gpuError:u,sustainabilityScore:m,showDescriptions:i,onShowDescriptionsChange:y,onOpenReport:p,onHide:n,editing:f=!1,onEditing:b=()=>{},canUndo:X=!1,canRedo:w=!1,onUndo:R=()=>{},onRedo:h=()=>{},onReset:x=()=>{}}){const{temperature:P}=c,[g,E]=S.useState(()=>new Array(48).fill(81.5));return S.useEffect(()=>{E(l=>[...l.slice(-47),P])},[P]),e.jsx("aside",{className:"telemetry-panel panel",children:e.jsxs(ze,{editing:f,children:[e.jsxs("div",{className:"panel-topline",children:[e.jsxs("div",{className:"panel-kicker",children:[e.jsx("span",{className:`status-dot ${u?"status-error":""}`}),"LIVE / TEST CHAMBER"]}),e.jsx("button",{className:"panel-hide",type:"button",onClick:n,children:"Hide"})]}),e.jsxs("div",{className:"subway-editor-toolbar",children:[e.jsx(Ne,{checked:f,onChange:b}),e.jsx(Ge,{canUndo:X,canRedo:w,onUndo:R,onRedo:h})]}),e.jsx(He,{configuration:a,onChange:r,className:"parameter-group"}),e.jsx(Ie,{configuration:a,onChange:r,className:"parameter-group",capabilities:{shape:!1,derivativeOrder:!1,colorMode:!1,color:!1},fields:[{key:"sizeScale",path:"particleDiameter",type:"range",label:"Particle diameter",min:U.particleDiameter.minimum,max:U.particleDiameter.maximum,step:U.particleDiameter.step,suffix:" m"},{key:"shape",path:"particleAppearance.shape",type:"select",label:"Particle shape",options:["native"],disabled:!0},{key:"derivativeOrder",path:"particleAppearance.derivativeOrder",type:"range",label:"Derivative order",min:W.particleAppearance.properties.derivativeOrder.minimum,max:W.particleAppearance.properties.derivativeOrder.maximum,step:W.particleAppearance.properties.derivativeOrder.step,disabled:!0},{key:"color",path:"particleAppearance.color",type:"color",label:"Particle tint",disabled:!0},{key:"opacity",path:"particleAppearance.opacity",type:"range",label:"Particle opacity",min:W.particleAppearance.properties.opacity.minimum,max:W.particleAppearance.properties.opacity.maximum,step:W.particleAppearance.properties.opacity.step}]}),e.jsxs("div",{className:"telemetry-heading",children:[e.jsx("span",{children:"Ambient field"}),e.jsxs("strong",{children:[P.toFixed(1),"°F"]})]}),e.jsx(ba,{values:g}),u&&e.jsxs("p",{className:"error-copy",children:["GPU field offline: ",u]}),e.jsxs("div",{className:"sustainability-readout",children:[e.jsxs("div",{className:"sustainability-heading",children:[e.jsx("span",{children:"Thermal resilience"}),e.jsxs("strong",{children:[m,"%"]})]}),e.jsx("div",{className:"sustainability-meter",children:e.jsx("span",{style:{width:`${m}%`}})}),e.jsxs("div",{className:"balance-labels",children:[e.jsx("span",{children:"PASSIVE FIRST"}),e.jsx("span",{children:"LOW ENERGY LOAD"})]}),e.jsx("button",{className:"report-link",type:"button",onClick:p,children:"Open resilience report"})]}),e.jsx("div",{className:"description-toggle",children:e.jsx(Z,{label:"Show descriptions",checked:i,onChange:y})}),e.jsxs("div",{className:"primary-parameter",children:[e.jsx(T,{parameter:"surfaceTemperature",label:"Surface temperature",value:a.surfaceTemperature,suffix:"°F",description:"Sets the station floor's thermal influence on nearby air.",showDescription:i,onChange:l=>r({surfaceTemperature:l})}),e.jsx(T,{parameter:"passengerHeat",label:"Passenger heat",value:a.passengerHeat,suffix:"",description:"Adds localized body heat around the visible passengers.",showDescription:i,onChange:l=>r({passengerHeat:l})}),e.jsx(T,{parameter:"roadSurfaceTemperature",label:"Road surface temperature",value:a.roadSurfaceTemperature,suffix:"°F",description:"Sets the outdoor road temperature that drives upward convection above the street.",showDescription:i,onChange:l=>r({roadSurfaceTemperature:l})}),e.jsx(T,{parameter:"ambientAirTemperature",label:"Ambient air above road",value:a.ambientAirTemperature,suffix:"°F",description:"Sets the outdoor air temperature that the upper field gradually approaches.",showDescription:i,onChange:l=>r({ambientAirTemperature:l})}),e.jsx(T,{parameter:"surfaceCrosswind",label:"Surface crosswind",value:a.surfaceCrosswind,suffix:" m/s",description:"Sets outdoor wind across the station along the Z axis; negative values reverse direction.",showDescription:i,onChange:l=>r({surfaceCrosswind:l})}),e.jsx(T,{parameter:"stairUndergroundOpeningHeight",label:"Stair underground opening",value:a.stairUndergroundOpeningHeight,suffix:" m",description:"Sets underground tunnel and doorway clear height without moving the stairs or turnstiles.",showDescription:i,onChange:l=>r({stairUndergroundOpeningHeight:l})}),e.jsx(T,{parameter:"stairLandingHeight",label:"Stair landing height",value:a.stairLandingHeight,suffix:" m",description:"Sets the level elevation between the lower and upper stair flights.",showDescription:i,onChange:l=>r({stairLandingHeight:l})}),e.jsx(T,{parameter:"stairSurfaceOpeningHeight",label:"Stair surface opening",value:a.stairSurfaceOpeningHeight,suffix:" m",description:"Sets the street opening elevation and moves the street and ventilation outlets with it.",showDescription:i,onChange:l=>r({stairSurfaceOpeningHeight:l})})]}),e.jsxs("div",{className:"toggles-group",children:[e.jsx(Z,{parameter:"train",label:"Allow trains to run",checked:a.train,description:"Runs one train through the station at the configured interval.",showDescription:i,onChange:l=>r({train:l})}),e.jsx(Z,{parameter:"shaftFans",label:"Powered shaft fans",checked:a.shaftFans,description:"Adds powered upward airflow in the three ventilation shafts.",showDescription:i,onChange:l=>r({shaftFans:l})}),e.jsx(Z,{parameter:"clerestoryWindows",label:"Clerestory windows",checked:a.clerestoryWindows,description:"Shows the bridging windows and enables clerestory exchange.",showDescription:i,onChange:l=>r({clerestoryWindows:l})}),e.jsx(Z,{parameter:"windOcclusion",label:"Wind resistance / occlusion",checked:a.windOcclusion,description:"Deflects airflow around station columns, platforms, and the train.",showDescription:i,onChange:l=>r({windOcclusion:l})}),e.jsx(Z,{parameter:"ac",label:"AC exhaust heat",checked:a.ac,description:"Adds heat and lift near the active train.",showDescription:i,onChange:l=>r({ac:l})}),e.jsx(Z,{parameter:"brakes",label:"Brake friction",checked:a.brakes,description:"Adds localized heat and turbulence during braking.",showDescription:i,onChange:l=>r({brakes:l})}),e.jsx(Z,{parameter:"floodTunnels",label:"Flood control tunnels",checked:a.floodTunnels,description:"Enables the below-station cold-sink gallery.",showDescription:i,onChange:l=>r({floodTunnels:l})})]}),e.jsxs("div",{className:"systems-group",children:[e.jsx("div",{className:"subsection-label",children:"SUSTAINABLE AIRFLOW SYSTEMS"}),e.jsx(T,{parameter:"shaftExchange",label:"Shaft exchange",value:a.shaftExchange,suffix:"",description:"Captures air toward the three passive vertical shafts.",showDescription:i,onChange:l=>r({shaftExchange:l})}),e.jsx(T,{parameter:"shaftFanVelocity",label:"Shaft fan velocity",value:a.shaftFanVelocity,suffix:" m/s",description:"Sets upward powered airflow through each ventilation shaft.",showDescription:i,onChange:l=>r({shaftFanVelocity:l})}),e.jsx(T,{parameter:"downFans",label:"Downward fans",value:a.downFans,suffix:"",description:"Pushes air down from the station ceiling fan banks.",showDescription:i,onChange:l=>r({downFans:l})}),e.jsx(T,{parameter:"floorAirMovers",label:"Floor air movers",value:a.floorAirMovers,suffix:"",description:"Blows air across the platform floor toward the stair route.",showDescription:i,onChange:l=>r({floorAirMovers:l})}),e.jsx(T,{parameter:"ceilingFans",label:"Ceiling flow",value:a.ceilingFans,suffix:"",description:"Sweeps the warm ceiling band toward the egress.",showDescription:i,onChange:l=>r({ceilingFans:l})}),e.jsx(T,{parameter:"grooves",label:"Passive grooves",value:a.grooves,suffix:"",description:"Adds low-energy guidance along the roof grooves.",showDescription:i,onChange:l=>r({grooves:l})}),e.jsx(T,{parameter:"roofPitch",label:"Roof pitch",value:a.roofPitch,suffix:"°",description:"Tilts the roof envelope and changes buoyant headroom.",showDescription:i,onChange:l=>r({roofPitch:l})}),e.jsx(T,{parameter:"roofOffset",label:"Ridge offset",value:a.roofOffset,suffix:" z",description:"Moves the roof ridge across the station width.",showDescription:i,onChange:l=>r({roofOffset:l})}),e.jsx(T,{parameter:"roofGapHorizontal",label:"Roof gap: horizontal",value:a.roofGapHorizontal,suffix:" m",description:"Sets the horizontal distance between the two roof panels.",showDescription:i,onChange:l=>r({roofGapHorizontal:l})}),e.jsx(T,{parameter:"roofGapVertical",label:"Roof gap: vertical",value:a.roofGapVertical,suffix:" m",description:"Sets the height bridged by each clerestory pane.",showDescription:i,onChange:l=>r({roofGapVertical:l})}),e.jsx(T,{parameter:"clerestoryOpen",label:"Clerestory opening",value:a.clerestoryOpen,suffix:"",description:"Controls passive exchange through the clerestory span.",showDescription:i,onChange:l=>r({clerestoryOpen:l})}),e.jsx(T,{parameter:"stackEffect",label:"Shaft stack effect",value:a.stackEffect,suffix:"",description:"Applies passive localized shaft lift to warm air; powered fans and crosswind draw remain separate.",showDescription:i,onChange:l=>r({stackEffect:l})}),e.jsx(T,{parameter:"floodFlow",label:"Flood gallery flow",value:a.floodFlow,suffix:"",description:"Pulls warm lower air into the gallery as a cold sink.",showDescription:i,onChange:l=>r({floodFlow:l})}),e.jsx(T,{parameter:"floodPumpDirection",label:"Flood pump direction",value:a.floodPumpDirection,suffix:"",description:"Sets the flood-gallery air-pump direction along X.",showDescription:i,onChange:l=>r({floodPumpDirection:l})})]}),e.jsxs("div",{className:"controls-group",children:[e.jsx("div",{className:"subsection-label",children:"SIMULATION"}),e.jsx(T,{parameter:"trainInterval",label:"Train interval",value:a.trainInterval,suffix:" s",description:"Time from the start of one train pass to the next.",showDescription:i,onChange:l=>r({trainInterval:l})}),e.jsx(T,{parameter:"trainStopFrequency",label:"Train stop frequency",value:a.trainStopFrequency,suffix:"",description:"Sets the fraction of train passes that stop at the platform.",showDescription:i,onChange:l=>r({trainStopFrequency:l})}),e.jsx(T,{parameter:"trainStopDuration",label:"Train stop duration",value:a.trainStopDuration,suffix:" s",description:"Sets how long a stopping train dwells at the platform.",showDescription:i,onChange:l=>r({trainStopDuration:l})}),e.jsx(T,{parameter:"particleCount",label:"Particle count",value:a.particleCount,suffix:"",description:"Rebuilds the GPU field with the selected number of rendered particles.",showDescription:i,onChange:l=>r({particleCount:l})}),e.jsx(T,{parameter:"particleMagnitudeScale",label:"Velocity diameter response",value:a.particleMagnitudeScale,suffix:"",description:"Scales individual particle diameter according to velocity magnitude.",showDescription:i,onChange:l=>r({particleMagnitudeScale:l})})]}),e.jsx(ja,{settings:a,telemetry:c,onSettingsChange:r,showDescriptions:i}),e.jsxs("details",{className:"parameter-group",children:[e.jsx("summary",{children:"Fluid parameters"}),e.jsxs("div",{className:"controls-group",children:[e.jsx(ke,{label:"Constitutive model",value:a.constitutiveModel,options:Ve,onChange:l=>r({constitutiveModel:l})}),e.jsx(T,{parameter:"constitutiveStrength",label:"Constitutive strength",value:a.constitutiveStrength,suffix:"",description:"Scales the selected experimental shear response.",showDescription:i,onChange:l=>r({constitutiveStrength:l})}),a.constitutiveModel==="ddf"&&e.jsx(T,{parameter:"constitutiveSpeedLimit",label:"DDF speed limit",value:a.constitutiveSpeedLimit,suffix:" m/s",description:"Sets the dimensionless onset scale for the DDF viscosity increase.",showDescription:i,onChange:l=>r({constitutiveSpeedLimit:l})}),e.jsx(T,{parameter:"density",label:"Air density",value:a.density,suffix:" kg/m³",description:"Mass packed into each simulated air volume.",showDescription:i,onChange:l=>r({density:l})}),e.jsx(T,{parameter:"stiffness",label:"Fluid stiffness",value:a.stiffness,suffix:"",description:"How strongly nearby particles resist compression.",showDescription:i,onChange:l=>r({stiffness:l})}),e.jsx(T,{parameter:"viscosity",label:"Viscosity",value:a.viscosity,suffix:" Pa·s",description:"How quickly neighboring air velocities blend.",showDescription:i,onChange:l=>r({viscosity:l})})]})]})]})})}function Ya({onBack:a}){const r=Xe(v),{value:c,commit:u,load:m,canUndo:i,canRedo:y,undo:p,redo:n}=r,[f,b]=S.useState(!1),[X,w]=S.useState(!1),[R,h]=S.useState(!0),[x,P]=S.useState("ortho1"),[g,E]=S.useState(!0),[l,j]=S.useState(!1),[s,I]=S.useState({temperature:81.5,shafts:[]}),[d,z]=S.useState("");Ye({undo:p,redo:n,canUndo:i,canRedo:y,isTextEditing:A=>["INPUT","TEXTAREA","SELECT"].includes(A.tagName)});const Y=A=>u(k=>({...k,...A})),N=Oe(c);return S.useEffect(()=>{if(!l)return;const A=k=>{k.key==="Escape"&&j(!1)};return window.addEventListener("keydown",A),()=>window.removeEventListener("keydown",A)},[l]),e.jsxs($e,{className:"app-shell",headerClassName:"topbar",brandClassName:"brand-lockup",mark:"T",markClassName:"brand-mark",title:"TRANSIT / UNDERGROUND",subtitle:"Thermodynamics lab",meta:e.jsxs(e.Fragment,{children:[e.jsx("span",{children:"GPGPU / SPH"}),e.jsx("span",{children:"FIELD 04"})]}),metaClassName:"subway-base-actions",metaContentClassName:"topbar-meta",parameterValue:c,presetValue:r.baseline,onParameterChange:A=>u(A),onHome:a,homeClassName:"mode-switch",children:[e.jsx("div",{className:"scene-layer",children:e.jsxs(ge,{camera:{position:[7,20,55],fov:45,near:.1,far:1e3},dpr:[1,2],gl:{antialias:!0,powerPreference:"high-performance"},children:[e.jsx("color",{attach:"background",args:["#071316"]}),e.jsx("fog",{attach:"fog",args:["#071316",28,72]}),e.jsx(Sa,{settings:c,viewMode:x,orbitalPlaying:g,parametersVisible:R,onManualViewChange:()=>P(null),onTelemetry:I,onGpuError:z})]})}),e.jsx(Ee,{className:"view-toolbar panel",modesClassName:"view-modes",views:se,viewMode:x,onViewChange:P,orbitPlaying:g,onToggleOrbit:()=>E(A=>!A),controls:e.jsx("button",{className:"params-toggle",type:"button","aria-pressed":R,onClick:()=>h(A=>!A),children:R?"Hide params":"Show params"})}),R&&e.jsx(wa,{settings:c,onSettingsChange:Y,telemetry:s,gpuError:d,sustainabilityScore:N.score,showDescriptions:X,onShowDescriptionsChange:w,onOpenReport:()=>j(!0),onHide:()=>h(!1),editing:f,onEditing:b,canUndo:i,canRedo:y,onUndo:p,onRedo:n,onReset:()=>m(v)}),e.jsxs("aside",{className:"legend-panel panel",children:[e.jsxs("div",{className:"legend-heading",children:[e.jsx("span",{children:"Thermal dispersion"}),e.jsx("span",{className:"legend-unit",children:"NORMALIZED / 0—1"})]}),e.jsx("div",{className:"gradient-bar"}),e.jsxs("div",{className:"legend-labels",children:[e.jsxs("span",{children:["60°F ",e.jsx("small",{children:"cool air"})]}),e.jsxs("span",{children:["85°F ",e.jsx("small",{children:"mixed"})]}),e.jsxs("span",{children:["110°F ",e.jsx("small",{children:"heat input"})]})]})]}),l&&e.jsx(Pa,{report:N,onClose:()=>j(!1)}),e.jsxs("footer",{className:"footer-note",children:[e.jsx("span",{children:"PLATFORM 04 / ACTIVE"}),e.jsx("span",{children:"Drag to orbit · Scroll to zoom"})]})]})}export{Ya as SubwaySim};
