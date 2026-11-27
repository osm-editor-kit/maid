# Wiki draft: the second left/right on Key:cycleway:separation

For a person to add to https://wiki.openstreetmap.org/wiki/Key:cycleway:separation as a new section. The research
behind it is in [../research/reverse-side-keys.md](../research/reverse-side-keys.md). The meaning is taken from
[Proposal:Separation](https://wiki.openstreetmap.org/wiki/Proposal:Separation), which is still a draft, so it may be
better to ask on the talk page or in the forum first.

---

== Left and right of the separation ==

A key like <code>cycleway:right:separation:left=*</code> has two sides:

* The '''first side''' (<code>cycleway:right</code>) is the side of the road, relative to the direction in which the way is drawn, as for every <code>cycleway:*</code> key.
* The '''second side''' (<code>separation:left</code>) is the side of the cycle lane, '''in the direction in which the lane is ridden''', as in [[Proposal:Separation]]. The riding direction is the value of {{Key|cycleway:right:oneway}}, or its implicit default.
** In countries with right-hand traffic, on a two-way road, <code>separation:left</code> is therefore the carriageway side of both lanes. So <code>cycleway:both:separation:left=*</code> describes the separation from the motor traffic on both sides.
** For a two-way lane (<code>cycleway:right:oneway=no</code>), left and right are read in the direction the lane would have as a one-way lane, which is the implicit default of its side.
* The same holds for <code>marking</code>, <code>buffer</code> and <code>traffic_mode</code> under a road side.
* On a cycleway mapped as a way of its own, <code>separation:left</code> is read in its riding direction if it is one-way, and in the direction of the line if it is not.

=== Reversing a way ===

Reversing a way does not change the street, so an editor:

* swaps the first side (<code>cycleway:right</code> ↔ <code>cycleway:left</code>);
* turns explicit <code>cycleway:*:oneway</code> values (<code>yes</code> ↔ <code>-1</code>) where the lane keeps its direction;
* keeps the second side, unless the riding direction of the lane was reversed on purpose (for example when the editor reverses the traffic of a one-way road).

Example on a two-way road: <code>cycleway:right=lane</code> + <code>cycleway:right:separation:left=bollard</code> becomes <code>cycleway:left=lane</code> + <code>cycleway:left:separation:left=bollard</code>.
