'use strict';

const utils = require('./utils.js');
const Level = require('./level.js');
const Planet = require('./planet.js');
const Cloud = require('./cloud.js');
const BiomaPalette = require('./palette.js');
const VictoryCard = require('./victory_card.js');
const GoalsCard = require('./goals_card.js');

const REVERSE_BIOMAS = require('./bioma_const').REVERSE_BIOMAS;

const RESTART_TIMEOUT = Phaser.Timer.SECOND * 5; // TODO: adjust

var PlayScene = {};

PlayScene.init = function (levelIndex) {
    this.level = new Level(levelIndex);
    this.isVictory = false;
};

PlayScene.create = function () {
    this._setupInput();
    this.camera.flash('#000000');

    this.sfx = {
        placed: this.game.add.audio('sfx:placed'),
        error: this.game.add.audio('sfx:error'),
        select: this.game.add.audio('sfx:select')
    };
    this.song = this.game.add.audio('track:bgm');
    this.song.fadeIn(2000, true);

    this.planetLayer = this.game.add.group();
    this.planetLayer.position.set(256, 256);
    this.planet = new Planet(this.planetLayer, this.level.data.map);

    // spawn clouds
    let clouds = this.planet.cloudLayer;
    clouds.position.set(-160, -160);
    clouds.add(new Cloud(this.game, 50, 96));
    clouds.add(new Cloud(this.game, 200, 40));
    clouds.add(new Cloud(this.game, 328, 156));

    this.game.add.image(0, 0, 'mask:medium'); // TODO: adjust to planet size

    this._setupUI();

    // cursor
    this.cursorSprite = this.game.add.image(0, 0, 'palette');
    this.cursorSprite.alpha = 0.5;
    this.cursorSprite.visible = false;

    this.frameCounter = 0;
};

PlayScene.update = function () {
    this.planet.update();

    // apply bioma cycles to planet
    this.frameCounter++;
    if (this.frameCounter === 15) {
        this.planet.tick();
        this.frameCounter = 0;
    }

    this.level.update(this.planet);
    this._updateUI();

    if (this.level.isVictory() && !this.isVictory) {
        this.isVictory = true;
        this.game.time.events.add(Phaser.Timer.SECOND * 1.5, this._victory,
            this);
    }
};

PlayScene.resetLevel = function () {
    this.game.state.restart(true, false, this.level.index);
};

PlayScene._victory = function () {
    this._showCard('victory');
    this.cards.victory.onClose.addOnce(function () {
        // TODO: show a "you have completed the game" banner when winning
        //       the last level
        if (this.level.isLast()) {
            this.game.state.start('title');
        }
        else {
            this.camera.flash('#000000');
            this.game.state.restart(true, false, this.level.index + 1);
        }
    }, this);
};

PlayScene._showCard = function (which) {
    this.cards[which].show();
    this.isModalActive = true;
};

PlayScene._hideCard = function () {
    this.isModalActive = false;
    Object.keys(this.cards).forEach(function (key) {
        this.cards[key].hide();
    }, this);
};

PlayScene._updateUI = function () {
    // update bioma cursor
    this.cursorSprite.x = this._snapToGrid(this.game.input.x);
    this.cursorSprite.y = this._snapToGrid(this.game.input.y);

    if (this.biomaPalette.currentBioma !== null && !this.isModalActive)  {
        this.cursorSprite.frame = this.biomaPalette.currentIcon;
        this.cursorSprite.visible = true;
    }
    else {
        this.cursorSprite.visible = false;
    }

    // update stats labels
    this.text.waterStat.font.text = this.planet.stats.normalizedWater + ' (' +
        this.planet.stats.waterLabel + ')';
    this.text.greenStat.font.text = this.planet.stats.normalizedGreen + ' (' +
        this.planet.stats.greenLabel + ')';

    if (!this.level.isFreeStyle()) {
        // update palette
        this.biomaPalette.update(this.level.getPalette());
        // update goals card
        this.cards.goals.updateGoals(this.level.getProgress());
    }

};

PlayScene._setupInput = function () {
    // NOTE: ñapa
    // See: https://goo.gl/N7MwJI
    let bg = this.game.add.sprite(0, 0);
    bg.fixedToCamera = true;
    bg.scale.setTo(this.game.width, this.game.height);
    bg.inputEnabled = true;
    bg.input.priorityID = 0; // lower priority
    bg.events.onInputDown.add(this._handleWorldClick, this);
};

/*jshint -W071 */
PlayScene._setupUI = function () {
    this.text = {};

    // create bioma palette
    this.hudPalette = this.game.add.group();
    this.hudPalette.position.set(4, 4);
    this.biomaPalette = new BiomaPalette(this.hudPalette, this.sfx.select,
        this.level.isFreeStyle() ? null : this.level.getPalette());

    // world stats
    this.hudStats = this.game.add.group();
    this.hudStats.position.set(4, 464);
    this.hudStats.create(0, 0, 'icon:stats', 0);
    this.hudStats.create(0, 24, 'icon:stats', 1);
    this.text.waterStat = utils.buildTextLabel(this.hudStats, 20, 0, '0 (dry)');
    this.text.greenStat = utils.buildTextLabel(this.hudStats, 20, 24,
        '0 (barren)');

    // reset button
    this.buttons = this.game.add.group();
    let resetButton = this.game.make.button(508, 4, 'icon:misc', function () {
        this.sfx.select.play(); // TODO: pick a different sound for reloading?
        this.resetLevel();
    }, this, 1, 1, 1, 1);
    resetButton.anchor.setTo(1, 0);
    this.buttons.add(resetButton);
    this.restartLabel = utils.buildTextLabel(this.buttons, -36, 6, 'restart?')
        .label;
    this.restartLabel.anchor.setTo(1, 0);
    resetButton.addChild(this.restartLabel);
    this.restartLabel.visible = false;

    // modals
    this.hudCards = this.game.add.group();
    this.hudCards.visible = false;
    let modalBg = this.hudCards.create(0, 0, 'bg:modal');
    modalBg.inputEnabled = true;
    this.cards = {};
    this.cards.victory = new VictoryCard(this.hudCards);

    // 'show goals' button and modal
    if (!this.level.isFreeStyle()) {
        let goalsButton = this.game.make.button(504, 504, 'button:medium',
        function () {
            this._showCard('goals');
        }, this, 0, 0, 0, 0);
        goalsButton.anchor.setTo(1, 1);
        let goalsLabel = utils.buildTextLabel(this.buttons,
            -goalsButton.width / 2, -goalsButton.height + 6, 'Goals');
        goalsButton.addChild(goalsLabel.label);
        goalsLabel.label.anchor.setTo(0.5, 0);
        this.buttons.add(goalsButton);

        this.cards.goals =  new GoalsCard(this.hudCards,
            this.level.getProgress());
        this.cards.goals.onClose.add(function () {
            this._hideCard();
        }, this);
    }

    if (!this.level.isFreeStyle()) { this._showCard('goals'); }
};
/*jshint +W071 */

PlayScene._handleWorldClick = function (target, pointer) {
    if (this.biomaPalette.currentBioma) { // place bioma in world
        let placedOutcome = this.planet.putBiomaWorldXY(
            this.biomaPalette.currentBioma, pointer.worldX, pointer.worldY);
        switch (placedOutcome) {
        case 1: // placement was ok
            this.sfx.placed.play();
            if (!this.level.isFreeStyle()) {
                this.level.consumeBioma(
                    REVERSE_BIOMAS[this.biomaPalette.currentBioma]);
                if (this.level.isBudgetDepleted()) {
                    this.game.time.events.add(RESTART_TIMEOUT,
                        this._showResetWarning, this);
                }
            }
            break;
        case -1: // tile outside bounds
            this.biomaPalette.unselect();
            break;
        case -2: // error placing tile
            this.sfx.error.play();
            break;
        }
    }
};

PlayScene._snapToGrid = function (value) {
    return Math.floor(value / Planet.T_SIZE) * Planet.T_SIZE;
};

PlayScene._showResetWarning = function () {
    if (!this.isVictory) {
        this.restartLabel.visible = true;
        this.game.add.tween(this.restartLabel).to({alpha: 0}, 1000,
            Phaser.Easing.InOut, true, 0, -1, true);
    }
};

PlayScene.shutdown = function () {
    this.song.stop();
};

module.exports = PlayScene;
