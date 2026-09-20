# Therapy frame animation assets

Generated with the built-in image-generation tool. No external paid video service was used. Existing static therapy pictures remain unchanged.

- `therapy-heel-slide-frames.png`: six registered poses of a lying heel slide.
- `therapy-bridge-frames.png`: six registered poses of a bodyweight bridge.
- Heel digs reuse `therapy-heel-dig.png` unchanged: an isometric hold has no joint movement.

The browser draws one atlas cell at a time, runs the six poses forward and backward, and supports pause and individual steps. Explicit per-row offsets keep the mat at a consistent height. This is a frame-by-frame illustration, not a smooth AI-generated video. Tapping an exercise picture explicitly starts playback; tapping the enlarged picture pauses or resumes it. Hiding the tab or changing the reduced-motion preference pauses playback.

The heel-dig demonstration starts a 25-second hold within the user's provided 20-30-second range when its picture is opened. Downward pressure markers and the countdown show the hold while the body stays still. Viewing a demonstration does not record an exercise or change the session's rest timer.

## Generation specification

Production sprite sheets with exactly two equal-width columns and three equal-height rows; fixed full-body camera, head right and feet left, consistent reference identity, proportions, green shirt, black shorts and shoes. No text, borders or labels. Desired sheet size 2048x1536; generated files are 1448x1086 with alpha, displayed on white.

### heel-slide

Reference: `therapy-heel-slide.png`

Movement prompt: Gentle lying heel slide. All six frames show the man lying flat, head RIGHT and feet LEFT, pelvis and torso down, one far leg extended unmoving. Near heel maintains mat contact. Frame 1 both legs extended. Frame 2 near heel slid toward hips a little, knee begins bending. Frame 3 heel closer, knee moderately bent. Frame 4 knee more bent. Frame 5 almost the reference bent position. Frame 6 near knee bent as in reference, near heel below knee. The heel moves only horizontally along the mat. No bridge or leg lift. Animate only the near thigh/shin/foot through these poses; torso head arms other leg stay at precisely the same coordinates.

### bridge

Reference: `ex-glute-bridge.png`

Movement prompt: Bodyweight bridge. All six frames show the man supine, head RIGHT feet LEFT, both knees bent and both feet firmly planted at the same coordinates, head upper shoulders arms resting on mat. Frame 1 pelvis fully DOWN touching mat. Frame 2 hips raised slightly. Frame 3 hips one third raised. Frame 4 hips two thirds raised. Frame 5 hips nearly raised. Frame 6 raised bridge as in the reference: shoulder hips knee in a natural straight line, no exaggerated back arch. Feet do NOT move, knees do not slide sideways, head/shoulders stay grounded. The thigh/torso angles change coherently as pelvis rises. All frames share fixed head, shoulder, feet and mat positions.

The same reference-image style, full-body framing, fixed contact points, and no-ghost-limbs constraints were applied to both prompts. Assets were reviewed for heel contact, hip movement, anatomy, and framing before integration.

## Sources and licenses

- Control icons: Lucide, ISC license in `lucide-LICENSE`.
- Heel-slide movement reference: https://www.uhsussex.nhs.uk/resources/active-10-bed-and-sitting-exercises/
- Bridge movement reference: https://www.rnoh.nhs.uk/patients-and-visitors/patient-information-guides/total-knee-replacement-exercise-pack

The user's exercise schedule and dosage remain unchanged. The illustrations are not a clinical validation of a personal treatment plan.
