
function checkToAttack(attacker, target, distance) {
    if (distance > attacker.range * 32) {
        return null;
    }
    if (target.cloaked) {
        attacker.target = null;
        return null;
    }
    if (!attacker.target) {
        // Store last target so we will keep attacking the same target until it is dead.
        attacker.target = target;
    }
    if (ifdefor(attacker.attackCooldown, 0) > now()) {
        return null;
    }
    attacker.attackCooldown = now() + 1000 / (attacker.attackSpeed * attacker.character.gameSpeed * Math.max(.1, (1 - attacker.slow)));
    return performAttack(attacker, target);
}
function applyArmorToDamage(damage, armor) {
    if (damage <= 0) {
        return 0;
    }
    //This equation looks a bit funny but is designed to have the following properties:
    //100% damage at 0 armor
    //50% damage when armor is equal to base damage
    //25% damage when armor is double base damage
    //1/(2^N) damage when armor is N times base damage
    return Math.max(1, Math.round(damage / Math.pow(2, armor / damage)));
}

function performAttack(attacker, target) {
    var damage = Random.range(attacker.minDamage, attacker.maxDamage);
    var magicDamage = Random.range(attacker.minMagicDamage, attacker.maxMagicDamage);
    var accuracyRoll = Random.range(0, attacker.accuracy);
    var evasionRoll = Random.range(0, target.evasion);
    if (accuracyRoll < evasionRoll) {
        if (ifdefor(attacker.damageOnMiss)) {
            target.health -= attacker.damageOnMiss;
            return 'miss (' + attacker.damageOnMiss + ')';
        }
        // Target has evaded the attack.
        return 'miss';
    }
    if (ifdefor(attacker.healthGainOnHit)) {
        attacker.health += attacker.healthGainOnHit;
    }
    if (ifdefor(attacker.slowOnHit)) {
        target.slow = Math.max(target.slow, attacker.slowOnHit);
    }
    // Apply block reduction
    var blockRoll = Random.range(0, target.block);
    var magicBlockRoll = Random.range(0, target.magicBlock);
    damage = Math.max(0, damage - blockRoll);
    magicDamage = Math.max(0, magicDamage - magicBlockRoll);
    // Apply armor and magic resistance mitigation
    // TODO: Implement armor penetration here.
    damage = applyArmorToDamage(damage, target.armor);
    magicDamage = Math.round(magicDamage * Math.max(0, (1 - target.magicResist)));
    // TODO: Implement flat damage reduction here.
    target.health -= (damage + magicDamage);
    return (damage + magicDamage) > 0 ? (damage + magicDamage) : 'blocked';
}

function defeatedEnemy(character, enemy) {
    if (character.health > 0) {
        // Character receives 10% penalty per level difference between them and the monster.
        var reducedXP = Math.floor(enemy.xp * Math.max(0, 1 - .1 * Math.abs(character.level - enemy.level)));
        gainXP(character, reducedXP);
        gain('IP', enemy.ip);
        if (enemy.ip) {
            character.textPopups.push(
                {value: '+' + enemy.ip, x: enemy.x + 35, y: 240 - 140, color: 'white', font: "20px sans-serif"}
            );
        }
        gain('MP', enemy.mp);
        if (enemy.mp) {
            character.textPopups.push(
                {value: '+' + enemy.mp, x: enemy.x + 45, y: 240 - 145, color: '#fc4', font: "22px sans-serif"}
            )
        }
        gain('RP', enemy.rp);
        if (enemy.rp) {
            character.textPopups.push(
                {value: '+' + enemy.rp, x: enemy.x + 55, y: 240 - 150, color: '#c4f', font: "24px sans-serif"}
            );
        }
        gain('UP', enemy.up);
        if (enemy.up) {
            character.textPopups.push(
                {value: '+' + enemy.up, x: enemy.x + 65, y: 240 - 155, color: '#4cf', font: "26px sans-serif"}
            );
        }
    }
}
function adventureLoop(character, delta) {
    character.time += delta * character.gameSpeed;
    if (character.area == null) {
        if (!character.previewContext) {
            var canvas = character.$panel.find('.js-infoMode .js-canvas')[0];
            character.previewContext = canvas.getContext("2d");
        }
        var fps = Math.floor(3 * 5 / 3);
        var frame = Math.floor(character.time * fps / 1000) % walkLoop.length;
        character.previewContext.clearRect(0, 0, 64, 128);
        character.previewContext.drawImage(character.personCanvas, walkLoop[frame] * 32, 0 , 32, 64, 0, -20, 64, 128);
        return;
    }
    var width = character.canvasWidth;
    var height = character.canvasHeight;
    var context = character.context;
    if (character.enemies.length == 0) {
        if (character.monsterIndex >= character.area.monsters.length) {
            // Victory!
            completeArea(character);
            return;
        }
        var monsters = character.area.monsters[character.monsterIndex];
        monsters = Array.isArray(monsters) ? monsters : [monsters]
        var x = character.x + 800;
        monsters.forEach(function (monster) {
            var newMonster = makeMonster(character.area.level, monster, x);
            newMonster.character = character;
            character.enemies.push(newMonster);
            x += Random.range(50, 150);
        });
        character.monsterIndex++;
    }
    var hit;
    if (character.target) {
        if (character.target.health > 0) {
            hit = checkToAttack(character, character.target, 0);
            if (hit != null) { // true means target is in range, but character can't attack yet
                character.textPopups.push(
                    {value: hit, x: character.target.x + 32, y: 240 - 128, color: 'red'}
                )
            }
        } else {
            character.target = null;
        }
    }
    if (!character.target && character.cloaking) {
        character.cloaked = true;
    }
    character.blocked = false;
    for (var i = 0; i < character.enemies.length; i++) {
        var enemy = character.enemies[i];
        enemy.blocked = false;
        if (enemy.health <= 0) {
            character.enemies.splice(i--, 1);
            defeatedEnemy(character, enemy);
            continue;
        }
        var distance = Math.abs(enemy.x - (character.x + 32));
        if (distance < 10) {
            character.blocked = true;
            enemy.blocked = true;
        }
        hit = checkToAttack(character, enemy, distance);
        if (hit != null){
            character.textPopups.push(
                {value: hit, x: enemy.x + 32, y: 240 - 128, color: 'red'}
            )
        }
        hit = checkToAttack(enemy, character, distance);
        if (hit != null){
            character.textPopups.push(
                {value: hit, x: character.x + 32, y: 240 - 128, color: 'red'}
            )
        }
        if (!enemy.target && enemy.cloaking) {
            enemy.cloaked = true;
        }
        if (enemy.target || enemy.blocked) {
            enemy.cloaked = false;
        }
        if (!enemy.blocked && !enemy.target && !ifdefor(enemy.stationary)) {
            enemy.x -= enemy.speed * Math.max(0, (1 - enemy.slow)) * delta * character.gameSpeed / 1000;
        }
        // Don't let enemy move past the character
        if (enemy.x < character.x + 32) {
            enemy.x = character.x + 32;
        }
        if (ifdefor(enemy.healthRegen)) {
            enemy.health += enemy.healthRegen * delta * character.gameSpeed / 1000;
        }
        enemy.health = Math.min(enemy.maxHealth, Math.max(0, enemy.health));
        enemy.slow = Math.max(0, enemy.slow - .1 * delta * character.gameSpeed / 1000);
    }
    // apply health regen to character, but only if it is alive.
    if (character.health > 0) {
        if (ifdefor(character.healthRegen)) {
            character.health += character.healthRegen * delta * character.gameSpeed / 1000;
        }
        character.slow = Math.max(0, character.slow - .1 * delta * character.gameSpeed / 1000);
        character.health = Math.min(character.maxHealth, Math.max(0, character.health));
    }
    if (!character.blocked && !character.target) {
        character.x += character.speed * Math.max(0, (1 - character.slow)) * delta * character.gameSpeed / 1000;
    }
    var cameraX = character.x - 10;
    context.clearRect(0, 0, width, height);
    var backgroundImage = ifdefor(character.area.backgroundImage, images['gfx/grass.png']);
    // Draw background
    for (var i = 0; i <= 768; i += 64) {
        var x = (784 + (i - character.x) % 768) % 768 - 64;
        context.drawImage(backgroundImage, 0, 0 , 64, 240,
                              x, 0, 64, 240);
    }
    for (var i = 0; i < character.enemies.length; i++) {
        var enemy = character.enemies[i];
        var enemyFps = ifdefor(enemy.base.fpsMultiplier, 1) * 3 * enemy.speed / 100;
        var source = enemy.base.source;
        var enemyFrame = Math.floor(character.time * enemyFps / 1000) % source.frames;
        if (enemy.cloaked) {
            context.globalAlpha = .2;
        }
        if (source.flipped) {
            context.translate((enemy.x - cameraX + source.width), 0);
            context.scale(-1, 1);
            context.drawImage(enemy.image, enemyFrame * source.width + source.offset, 0 , source.width, 64, -source.width, 240 - 128 - 72, source.width * 2, 128);
            context.scale(-1, 1);
            context.translate(-(enemy.x - cameraX + source.width), 0);

        } else {
            context.translate((enemy.x - cameraX + source.width), 0);
            context.drawImage(enemy.image, enemyFrame * source.width + source.offset, 0 , source.width, 64, -source.width, 240 - 128 - 72, source.width * 2, 128);
            context.translate(-(enemy.x - cameraX + source.width), 0);
        }
        context.globalAlpha = 1;
        enemy.left = enemy.x - cameraX;
        enemy.top = 240 - 128 - 72;
        enemy.width = source.width * 2;
        enemy.height = 128;
        // Uncomment to draw a reference of the character to show where left side of enemy should be
        //context.drawImage(character.personCanvas, 0 * 32, 0 , 32, 64, enemy.x - cameraX, 240 - 128 - 72, 64, 128);
        // life bar
        drawBar(context, enemy.x - cameraX + 20, 240 - 128 - 36 - 5 * i, 64, 4, 'white', enemy.color, enemy.health / enemy.maxHealth);
    }
    // Draw enemies
    for (var i = 0; i <= 768; i += 64) {
        var x = (784 + (i - character.x) % 768) % 768 - 64;
    }
    if (character.target || character.blocked) {
        character.cloaked = false;
    }
    if (character.target) {
        var attackFps = 1000 / ((1000 / character.attackSpeed) / fightLoop.length);
        var frame = Math.floor(Math.abs(character.time - character.attackCooldown) * attackFps / 1000) % fightLoop.length;
        context.drawImage(character.personCanvas, fightLoop[frame] * 32, 0 , 32, 64,
                        character.x - cameraX, 240 - 128 - 72, 64, 128);
    } else {
        if (character.cloaked) {
            context.globalAlpha = .2;
        }
        var fps = Math.floor(3 * character.speed / 100);
        var frame = Math.floor(character.time * fps / 1000) % walkLoop.length;
        context.drawImage(character.personCanvas, walkLoop[frame] * 32, 0 , 32, 64,
                        character.x - cameraX, 240 - 128 - 72, 64, 128);
    }
    context.globalAlpha = 1;
    // life bar
    drawBar(context, character.x - cameraX, 240 - 128 - 72, 64, 4, 'white', 'red', character.health / character.maxHealth);
    // xp bar
    drawBar(context, 35, 240 - 15, 400, 6, 'white', '#00C000', character.xp / character.xpToLevel);
    context.font = "20px sans-serif";
    context.textAlign = 'right'
    context.fillText(character.level, 30, 240 - 5);
    // Draw damage indicators
    context.fillStyle = 'red';
    for (var i = 0; i < character.textPopups.length; i++) {
        var textPopup = character.textPopups[i];
        context.fillStyle = ifdefor(textPopup.color, "red");
        context.font = ifdefor(textPopup.font, "20px sans-serif");
        context.textAlign = 'center'
        context.fillText(textPopup.value, textPopup.x - cameraX, textPopup.y);
        textPopup.y--;
        if (textPopup.y < 60) {
            character.textPopups.splice(i--, 1);
        }
    }
    if (character.health <= 0) {
        resetCharacter(character);
    }
}