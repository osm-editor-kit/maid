# PhotoCAD and machine drafts of the street space

2026-11-05. The question: what does [photocad.ai](https://photocad.ai/) do, and how could the same idea, run on street photos and aerial imagery, produce draft data of the street space (trees, street cabinets, parking lanes, sidewalks, cycleways, carriageway, lanes) that a person reviews in Maid before anything goes into OSM?

Sources were read through WebFetch summaries on 2026-11-05. Quotes are short and should be checked on the live page before anyone relies on them.

## What PhotoCAD does

**Stated by the site:**

- One photo, scan, PDF page or orthophoto in; vector linework out as DXF, DWG, SVG or PDF ([how it works](https://photocad.ai/how-it-works)).
- The pitch is "semantic understanding, not pixel tracing": the AI "understands what the photo depicts" and drops shadows, tone and texture. The site contrasts this with Vectorizer.AI, Inkscape and Adobe Image Trace.
- The output is regular geometry: straight lines, fitted arcs, few nodes. All linework sits on one layer; dimensions and the title block get their own layers.
- Scale comes from a world file or GeoTIFF, or from two points the user clicks at a known distance. Lat/long and Web Mercator are reprojected to the local UTM zone ([aerial guide](https://photocad.ai/guides/aerial-image-to-cad)). From aerial images it draws "building outlines as closed shapes, roads and paths as lines".
- Review is a person's job: a browser preview, then line editing (trim, delete, line weight) and sheet layout. For surveyors it calls itself "a drafting tool, not a surveying tool" ([surveyors](https://photocad.ai/for/surveyors)).
- The API is asynchronous: `POST /api/v1/convert`, then poll `GET /api/v1/conversions/{id}`, then download a format. A `geometry` format returns the paths as JSON. Options include `detailed` and `remove_background` ([API](https://photocad.ai/api)).
- One founder, an architect in Cambridge ([about](https://photocad.ai/about)). Hosting is Vercel and Supabase. The AI providers are "US-based" and not named ([trust](https://photocad.ai/trust)). No model and no method is named anywhere.

**Inferred (not stated):** a thin product around a hosted vision model. Likely steps:

1. Crop the area and, optionally, isolate the subject.
2. A vision model, generative or segmentation-based, draws clean line art.
3. Regularise and vectorise: snap lines straight, fit arcs.
4. Georeference from the world file.
5. Write the CAD formats.

What it sells is steps 2 and 3. PhotoCAD has no classes, no attributes and no topology: a line does not say whether it is a kerb or a wall.

### Evidence from public output (2026-11-05)

These checks need no account and no upload.

- **Client code.** The site runs on Next.js on Vercel, with files in Supabase Storage. The public JavaScript bundles name no model, provider or tracer: no OpenAI, Gemini, Replicate, fal, Flux, potrace or vtracer. Conversion runs on the server.
- **Gallery pairs.** The public gallery bucket holds `<slug>-original.webp` and `<slug>-vector.webp` for every item. The vector files are only rendered previews; DXF and SVG need a sign-in.

Comparing the pairs:

- **Rangefinder camera photo: redrawn, not traced.**
  - The lens lettering and the brand text are gone.
  - The knurling becomes evenly spaced, rounded teeth.
  - The fingers are simplified, and the controls on top are reshaped into clean cylinders.
  - Lighting and texture vanish completely.

  This is the mark of a generative image model asked for "a clean line drawing of this". Tracing keeps what is there; this invents regularity.
- **London poster map: geometry faithful.**
  - The street pattern and the river match the original closely at block level.
  - Each white street comes back as two outlines, one per edge, and filled areas become outlines.
  - The full stops in "51.507°N 0.128°W" are lost.

  The model keeps flat graphics almost as they are. The vectoriser then outlines wide strokes as closed shapes.
- **Line style.** All output is drawn as one uniform, smooth stroke. Thin drawn lines come back as a single line, and wide bands come back as both edges. That points to a tracer that follows the centre line of thin strokes and the outline of wide areas, followed by curve fitting ("smooth continuous curves with minimal nodes").

**Most likely pipeline, inferred:**

1. Crop the chosen area.
2. A hosted image-to-image model redraws it as a black-and-white line drawing (the "US-based AI providers"). This step hallucinates.
3. A classical vectoriser: centre line for thin strokes, outline for wide ones, fitted to lines, arcs and Béziers.
4. Scale and georeference from the world file.
5. Write DXF, DWG, SVG and PDF.

None of the steps looks proprietary. The value is in the prompt or model choice, the tracer tuning and the product around it.

**How to confirm.** This needs an account, so a person, not an agent, would have to:

- **Download a gallery DXF.** Its entity types show the fitting: `LINE` and `ARC` versus `SPLINE` versus `LWPOLYLINE`.
- **Convert a synthetic test image** of known geometry, for example a grid, text and a circle. Measuring the deviation shows how much the model redraws.
- **Read the browser's network log** during a conversion. It shows whether any third-party endpoint is visible from the client.

**For street-space drafts** this is a warning as much as a model. A generative redraw gives clean lines but can move or invent kerbs and objects. Geometry for OSM should come from segmentation of the orthophoto, which keeps pixels in place, and not from an image generator. Generative models are better used for classifying attributes than for drawing geometry.

## What carries over, and what does not

| PhotoCAD                                | Street-space drafts for OSM                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One image, one object                   | Many images per street: an orthophoto plus a sequence of street photos, all with a known pose                                                          |
| Semantic model instead of tracing       | Same idea, but with **classes** (carriageway, sidewalk, cycleway, parking, green strip, tree, cabinet) and **attributes** (surface, parking orientation) |
| Regularise to lines and arcs            | Regularise **along the OSM street axis**: offsets and widths per side instead of free linework                                                          |
| World file gives scale and position     | Orthophoto via WMS or GeoTIFF; photos via camera pose from Panoramax or Mapillary                                                                      |
| One layer of linework                   | OSM objects with tags, or tag changes on existing ways                                                                                                 |
| A person edits lines in a preview       | A person reviews each proposal in Maid and accepts, changes or ignores it                                                                              |

The key change is the second regularisation step. Free polygons of "sidewalk" are hard to review and hard to map. A **cross-section per street segment** fits OSM's way-based model: carriageway width, then per side cycleway, parking, green strip and sidewalk, each with a width and a type.

## A pipeline sketch

It runs **outside Maid** (for example in tilda-geo or a separate script). Maid only reads its output, so core rule 1 stays untouched: Maid and its automation never call a model or an imagery service on their own.

1. **Segment the orthophoto.** Take a recent high-resolution orthophoto (for example a city DOP at 10–20 cm) along the OSM `highway` ways. Run semantic segmentation into the street-space classes; trees show as crowns. This gives surfaces and widths, but not what is under the tree crowns.
2. **Profile per segment.** Cut the class mask with sections perpendicular to the OSM way every few metres. Smooth the sequence of class runs into one cross-section per segment. This plays the role of PhotoCAD's "straight lines and arcs".
3. **Detect in street photos.** Panoramax or Mapillary images near the way give point objects and attributes the orthophoto cannot see:
   - street cabinets, posts and signs
   - the parking orientation (parallel, diagonal, perpendicular) and whether parking is on the kerb
   - surface, and whether a cycleway is separated or painted

   Position comes from the camera pose plus two or more views, or by snapping to the profile from step 2. Mapillary already publishes its own detections for some classes; they would be one input, not the source of truth.
4. **Merge and compare with OSM.** Match against the current OSM data and keep only differences: a missing tree, a missing `street:parking:*` tag, a cycleway that OSM does not have. Every proposal carries a confidence and its evidence (image ids, a crop of the orthophoto).
5. **Write a task file.** One task per proposal, in Maid's format (`packages/tasks/FORMAT.md`).

## What Maid already has for the review step

- **Task files** (`packages/tasks`, `packages/module-tasks`, skill `maid-task-file`):
  - Options can set or remove tags on an existing feature (`tag`), add a node, a way or a closed way (`create`), or delete one (`delete`). Each option is one undo step.
  - `mapillary` ids and links per task bring the evidence along. Unknown properties survive and can be shown in the description with `{{key}}`, for example a confidence.
  - Progress per task (open, done, ignored, skipped) lives in the user's preferences.
- **Street imagery** (`packages/module-street-imagery`): Mapillary and Panoramax viewer, "Use this photo" for image keys with side prefixes.
- **Background imagery** (`packages/module-imagery`): the layer index, OpenAerialMap and custom XYZ templates, enough to show the same orthophoto the model saw.
- **Data layers** (`packages/module-data-layers`): a GeoJSON overlay. Today it is drawn in one colour, not styled by property.
- **Parking app** (`apps/maid-parking`): parking per side, the parking lens, quick tags. Proposals that change `parking:*` tags on existing ways fit the `tag` action without any new code.

## Gaps

- **Geometry:** a task cannot move a feature or change a way's geometry. `create` does not join new ways to existing ones. A drafted sidewalk or cycleway as a separate way would arrive unconnected.
- **Lanes and widths:** there is no cross-section UI. `docs/research/lanes-ux.md` proposes one, but it is not built. Proposals for `lanes`, `width` or `cycleway:*:width` could only be reviewed as raw tag diffs.
- **Confidence:** there is no field for confidence or evidence that Maid sorts or filters by. It only shows up as text.
- **Detections in the viewer:** the photo viewer cannot draw a box around the detected object, so the reviewer has to find it in the image.

## Recommendation for a first test

Start where the model's output and Maid's review already meet: **parking per street side as tag changes** on existing `highway` ways (`parking:left|right` with orientation and position), with evidence from an orthophoto crop and two or three street photos per task. That needs no geometry, uses the parking lens and the `tag` action as they are, and shows quickly how often a person accepts the proposal. The second test is **trees as new nodes** (`natural=tree`) from orthophoto crowns. Cabinets, separate sidewalks and lanes come only after the gaps above are closed.

Open before a build:

- Which imagery may feed OSM edits? The source and its licence have to be settled for each city, and the orthophoto has to be recent.
- Which model to use: open-vocabulary segmentation plus a vision-language model for attributes, or a model trained on labelled street-space data? This needs a small labelled sample to measure against.
