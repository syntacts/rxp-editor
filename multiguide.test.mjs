RXPGuides.RegisterGuide("Kamisayo |T236448:0|t Speedrun 1-14",[[
<< Rogue
#classic
<<Alliance
#name Northshire 1-6
#next Goldshire 6-10

step
.goto Elwynn Forest,52.55,48.79
>>Talk to |cRXP_FRIENDLY_Deputy Willem|r
.accept 783 >>Accept |cRXP_PICK_A Threat Within|r

step
.goto Elwynn Forest,52.55,48.79,0
.goto Elwynn Forest,55.43,45.87,0
.goto Elwynn Forest,53.89,50.52,30
>>Kill |cRXP_ENEMY_Kobold Vermin|r until level 3
.complete 783,1
.mob Kobold Vermin

step
.train 1752 >> Train |T132350:0|t[Sinister Strike]
+Remember to |cRXP_WARN_visit the trainer|r

step
.goto Northshire Valley,43.6,67.6
.turnin 783 >>Turn in A Threat Within
.hs

]])
