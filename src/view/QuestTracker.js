import RepositionableApplication from './RepositionableApplication.js';
import QuestAPI                  from '../control/public/QuestAPI.js';
import QuestDB                   from '../control/QuestDB.js';
import Socket                    from '../control/Socket.js';
import Utils                     from '../control/Utils.js';
import ViewManager               from '../control/ViewManager.js';

import { constants, jquery, questStatus, settings } from '../model/constants.js';

/**
 * Provides the quest tracker which provides an overview of active quests and objectives which can be opened / closed
 * to show all objectives for a given quest. The folder / open state is stored in {@link sessionStorage} and is shared
 * between the {@link QuestLogFloating}.
 *
 * In the {@link QuestTracker.getData} method {@link QuestTracker.prepareQuests} is invoked which gets all sorted
 * {@link questStatus.active} via {@link QuestDB.sortCollect}. They are then mapped creating the specific data which is
 * used in the {@link Handlebars} template. In the future this may be cached in a similar way that {@link Quest} data
 * is cached for {@link QuestLog}.
 */
export default class QuestTracker extends RepositionableApplication
{
   /**
    * @inheritDoc
    * @see https://foundryvtt.com/api/Application.html
    */
   constructor(options = {})
   {
      super(Object.assign({}, options, { positionSetting: settings.questTrackerPosition }));
   }

   /**
    * Default {@link Application} options
    *
    * @returns {object} options - Application options.
    * @see https://foundryvtt.com/api/Application.html#options
    */
   static get defaultOptions()
   {
      return foundry.utils.mergeObject(super.defaultOptions, {
         id: 'quest-tracker',
         template: 'modules/forien-quest-log/templates/quest-tracker.html',
         popOut: false
      });
   }

   /**
    * Defines all {@link JQuery} control callbacks with event listeners for click, drag, drop via various CSS selectors.
    *
    * @param {JQuery}  html - The jQuery instance for the window content of this Application.
    *
    * @see https://foundryvtt.com/api/FormApplication.html#activateListeners
    */
   activateListeners(html)
   {
      super.activateListeners(html);

      html.on(jquery.click, '.quest-tracker-header', void 0, this._handleQuestClick.bind(this));
      html.on(jquery.click, '.quest-tracker-link', void 0, this._handleQuestOpen);
      html.on(jquery.click, '.quest-tracker-task', void 0, this._handleQuestTask.bind(this));

      // A little trick to enable `pointer-events: auto` when the max-height for the scrollable container is reached.
      // This allows mouse events to scroll. The reason for this is that with `pointer-events: none` by default
      // Tokens underneath the quest tracker can be manipulated without moving the quest tracker.
      const scrollable = html.find('.scrollable');
      if (scrollable.height() >= parseInt(scrollable.css('max-height')))
      {
         scrollable.css('pointer-events', 'auto');
      }
   }

   /**
    * Gets the background boolean value from module settings {@link FQLSettings.questTrackerBackground} and parses quest
    * data in {@link QuestTracker.prepareQuests}.
    *
    * @override
    * @inheritDoc
    * @see https://foundryvtt.com/api/FormApplication.html#getData
    */
   async getData(options = {})
   {
      return foundry.utils.mergeObject(super.getData(options), {
         background: game.settings.get(constants.moduleName, settings.questTrackerBackground),
         quests: await this.prepareQuests()
      });
   }

   /**
    * Data for the quest folder open / close state is saved in {@link sessionStorage}.
    *
    * @param {JQuery.ClickEvent} event - JQuery.ClickEvent
    */
   _handleQuestClick(event)
   {
      const questId = event.currentTarget.dataset.questId;

      const folderState = sessionStorage.getItem(`${constants.folderState}${questId}`);
      const collapsed = folderState !== 'false';
      sessionStorage.setItem(`${constants.folderState}${questId}`, (!collapsed).toString());

      this.render();

      if (ViewManager.questLogFloating.rendered) { ViewManager.questLogFloating.render(); }
   }

   /**
    * Handles the quest open click via {@link QuestAPI.open}.
    *
    * @param {JQuery.ClickEvent} event - JQuery.ClickEvent
    */
   _handleQuestOpen(event)
   {
      const questId = event.currentTarget.dataset.questId;
      QuestAPI.open({ questId });
   }

   /**
    * Handles toggling {@link Quest} tasks when clicked on by a user that is the GM or owner of quest.
    *
    * @param {JQuery.ClickEvent} event - JQuery.ClickEvent
    */
   async _handleQuestTask(event)
   {
      // Don't handle any clicks of internal anchor elements such as entity content links.
      if ($(event.target).is('.quest-tracker-task a')) { return; }

      const questId = event.currentTarget.dataset.questId;
      const uuidv4 = event.currentTarget.dataset.uuidv4;

      const quest = QuestDB.getQuest(questId);

      if (quest)
      {
         const task = quest.getTask(uuidv4);
         if (task)
         {
            task.toggle();
            await quest.save();

            Socket.refreshQuestPreview({
               questId,
               focus: false
            });
         }
      }
   }

   /**
    * Prepares the quest data from sorted active quests.
    *
    * @returns {object[]} Sorted active quests.
    */
   async prepareQuests()
   {
      return QuestDB.sortCollect({ status: questStatus.active }).map((entry) =>
      {
         const q = entry.enrich;
         const collapsed = sessionStorage.getItem(`${constants.folderState}${q.id}`) === 'false';

         const tasks = collapsed ? q.data_tasks : [];
         const subquests = collapsed ? q.data_subquest : [];

         return {
            id: q.id,
            canEdit: game.user.isGM || (entry.isOwner && Utils.isTrustedPlayerEdit()),
            playerEdit: entry.isOwner,
            source: q.giver,
            name: `${q.name} ${q.taskCountLabel}`,
            isGM: game.user.isGM,
            isHidden: q.isHidden,
            isInactive: q.isInactive,
            isPersonal: q.isPersonal,
            personalActors: q.personalActors,
            hasObjectives: q.hasObjectives,
            subquests,
            tasks
         };
      });
   }
}