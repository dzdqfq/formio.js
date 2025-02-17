import _ from 'lodash';
import BaseComponent from '../base/Base';
import EventEmitter from 'eventemitter2';
import NativePromise from 'native-promise-only';
import { isMongoId, eachComponent } from '../../utils/utils';
import Formio from '../../Formio';
import Form from '../../Form';

export default class FormComponent extends BaseComponent {
  static schema(...extend) {
    return BaseComponent.schema({
      label: 'Form',
      type: 'form',
      key: 'form',
      src: '',
      reference: true,
      form: '',
      path: ''
    }, ...extend);
  }

  static get builderInfo() {
    return {
      title: 'Nested Form',
      icon: 'fa fa-wpforms',
      group: 'advanced',
      documentation: 'http://help.form.io/userguide/#form',
      weight: 110,
      schema: FormComponent.schema()
    };
  }

  constructor(component, options, data) {
    super(component, options, data);
    this.subForm = null;
    this.formSrc = '';
    this.subFormReady = new NativePromise((resolve, reject) => {
      this.subFormReadyResolve = resolve;
      this.subFormReadyReject = reject;
    });
    this.subFormLoaded = false;
    this.subscribe();
  }

  get dataReady() {
    return this.subFormReady;
  }

  get defaultSchema() {
    return FormComponent.schema();
  }

  get emptyValue() {
    return { data: {} };
  }

  set root(inst) {
    this._root = inst;
    this.nosubmit = inst.nosubmit;
  }

  get root() {
    return this._root;
  }

  set nosubmit(value) {
    this._nosubmit = !!value;

    if (this.subForm) {
      this.subForm.nosubmit = !!value;
    }
  }

  get nosubmit() {
    return this._nosubmit || false;
  }

  get currentForm() {
    return this._currentForm;
  }

  set currentForm(instance) {
    this._currentForm = instance;
    if (!this.subForm) {
      return;
    }
    this.subForm.getComponents().forEach(component => {
      component.currentForm = this;
    });
  }

  subscribe() {
    this.on('nosubmit', value => {
      this.nosubmit = value;
    });
  }

  destroy() {
    const state = super.destroy() || {};
    if (this.subForm) {
      this.subForm.destroy();
    }
    return state;
  }

  /**
   * Render a subform.
   *
   * @param form
   * @param options
   */
  renderSubForm(form, options) {
    if (this.options.builder) {
      this.element.appendChild(this.ce('div', {
        class: 'text-muted text-center p-2'
      }, this.text(form.title)));
      return;
    }

    options.events = this.createEmitter();

    // Iterate through every component and hide the submit button.
    eachComponent(form.components, (component) => {
      if (
        (component.type === 'button') &&
        ((component.action === 'submit') || !component.action)
      ) {
        component.hidden = true;
      }
    });

    (new Form(this.element, form, options)).render().then((instance) => {
      this.subForm = instance;
      this.subForm.root = this.root;
      this.subForm.currentForm = this;
      this.subForm.parent = this;
      this.subForm.parentVisible = this.visible;
      this.subForm.on('change', () => {
        this.dataValue = this.subForm.getValue();
        this.triggerChange({
          noEmit: true
        });
      });
      this.subForm.url = this.formSrc;
      this.subForm.nosubmit = this.nosubmit;
      this.restoreValue();
      this.subFormReadyResolve(this.subForm);
      return this.subForm;
    });
  }

  show(...args) {
    const state = super.show(...args);

    if (!this.subFormLoaded) {
      if (state) {
        this.loadSubForm();
      }
      // If our parent is read-only and is done loading, and we were never asked
      // to load a subform, consider our subform loading promise resolved
      else if (this.parent.options.readOnly && !this.parent.loading) {
        this.subFormReadyResolve(this.subForm);
      }
    }

    return state;
  }

  /**
   * Load the subform.
   */
  /* eslint-disable max-statements */
  loadSubForm() {
    // Only load the subform if the subform isn't loaded and the conditions apply.
    if (this.subFormLoaded) {
      return this.subFormReady;
    }
    this.subFormLoaded = true;
    const srcOptions = {};
    if (this.options && this.options.base) {
      srcOptions.base = this.options.base;
    }
    if (this.options && this.options.project) {
      srcOptions.project = this.options.project;
    }
    if (this.options && this.options.readOnly) {
      srcOptions.readOnly = this.options.readOnly;
    }
    if (this.options && this.options.breadcrumbSettings) {
      srcOptions.breadcrumbSettings = this.options.breadcrumbSettings;
    }
    if (this.options && this.options.buttonSettings) {
      srcOptions.buttonSettings = this.options.buttonSettings;
    }
    if (this.options && this.options.icons) {
      srcOptions.icons = this.options.icons;
    }
    if (this.options && this.options.viewAsHtml) {
      srcOptions.viewAsHtml = this.options.viewAsHtml;
    }
    if (this.options && this.options.hide) {
      srcOptions.hide = this.options.hide;
    }
    if (this.options && this.options.show) {
      srcOptions.show = this.options.show;
    }
    if (_.has(this.options, 'language')) {
      srcOptions.language = this.options.language;
    }

    if (this.component.src) {
      this.formSrc = this.component.src;
    }

    if (
      !this.component.src &&
      !this.options.formio &&
      (this.component.form || this.component.path)
    ) {
      if (this.component.project) {
        this.formSrc = Formio.getBaseUrl();
        // Check to see if it is a MongoID.
        if (isMongoId(this.component.project)) {
          this.formSrc += '/project';
        }
        this.formSrc += `/${this.component.project}`;
        srcOptions.project = this.formSrc;
      }
      else {
        this.formSrc = Formio.getProjectUrl();
        srcOptions.project = this.formSrc;
      }
      if (this.component.form) {
        this.formSrc += `/form/${this.component.form}`;
      }
      else if (this.component.path) {
        this.formSrc += `/${this.component.path}`;
      }
    }

    // Build the source based on the root src path.
    if (!this.formSrc && this.options.formio) {
      const rootSrc = this.options.formio.formsUrl;
      if (this.component.path) {
        const parts = rootSrc.split('/');
        parts.pop();
        this.formSrc = `${parts.join('/')}/${this.component.path}`;
      }
      if (this.component.form) {
        this.formSrc = `${rootSrc}/${this.component.form}`;
      }
    }

    // Add revision version if set.
    if (this.component.formRevision || this.component.formRevision === 0) {
      this.formSrc += `/v/${this.component.formRevision}`;
    }

    // Determine if we already have a loaded form object.
    if (this.component && this.component.components && this.component.components.length) {
      this.renderSubForm(this.component, srcOptions);
    }
    else if (this.formSrc) {
      const query = { params: { live: 1 } };
      (new Formio(this.formSrc)).loadForm(query)
        .then((formObj) => this.renderSubForm(formObj, srcOptions))
        .catch((err) => this.subFormReadyReject(err));
    }
    return this.subFormReady;
  }
  /* eslint-enable max-statements */

  checkValidity(data, dirty) {
    if (this.subForm) {
      return this.subForm.checkValidity(this.dataValue.data, dirty);
    }

    return super.checkValidity(data, dirty);
  }

  checkConditions(data) {
    const visible = super.checkConditions(data);
    const subForm = this.subForm;

    // Return if already hidden
    if (!visible) {
      return visible;
    }

    if (subForm && subForm.hasCondition()) {
      return this.subForm.checkConditions(this.dataValue.data);
    }

    return visible;
  }

  calculateValue(data, flags) {
    if (this.subForm) {
      return this.subForm.calculateValue(this.dataValue.data, flags);
    }

    return super.calculateValue(data, flags);
  }

  setPristine(pristine) {
    super.setPristine(pristine);
    if (this.subForm) {
      this.subForm.setPristine(pristine);
    }
  }

  get shouldSubmit() {
    return !this.component.hasOwnProperty('reference') || this.component.reference;
  }

  /**
   * Submit the form before the next page is triggered.
   */
  beforeNext() {
    // If we wish to submit the form on next page, then do that here.
    if (this.shouldSubmit) {
      return this.loadSubForm().then(() => {
        return this.subForm.submitForm().then(result => {
          this.dataValue = result.submission;
          return this.dataValue;
        }).catch(err => {
          this.subForm.onSubmissionError(err);
          return NativePromise.reject(err);
        });
      });
    }
    else {
      return super.beforeNext();
    }
  }

  /**
   * Submit the form before the whole form is triggered.
   */
  beforeSubmit() {
    const submission = this.dataValue;

    // This submission has already been submitted, so just return the reference data.
    if (submission && submission._id && submission.form) {
      this.dataValue = this.shouldSubmit ? {
        _id: submission._id,
        form: submission.form
      } : submission;
      return NativePromise.resolve(this.dataValue);
    }

    // This submission has not been submitted yet.
    if (this.shouldSubmit) {
      return this.loadSubForm().then(() => {
        return this.subForm.submitForm()
          .then(result => {
            this.subForm.loading = false;
            this.dataValue = {
              _id: result.submission._id,
              form: result.submission.form
            };
            return this.dataValue;
          })
          .catch(() => {});
      });
    }
    else {
      return super.beforeSubmit();
    }
  }

  build() {
    this.createElement();

    // Do not restore the value when building before submission.
    if (!this.options.beforeSubmit) {
      this.restoreValue();
    }
    this.attachLogic();
  }

  isHidden() {
    if (!this.visible) {
      return true;
    }

    return !super.checkConditions(this.rootValue);
  }

  setValue(submission, flags, norecurse) {
    this._submission = submission;
    if (this.subForm || norecurse) {
      if (
        !norecurse &&
        submission &&
        submission._id &&
        this.subForm.formio &&
        !flags.noload &&
        (_.isEmpty(submission.data) || this.shouldSubmit)
      ) {
        const submissionUrl = `${this.subForm.formio.formsUrl}/${submission.form}/submission/${submission._id}`;
        this.subForm.setUrl(submissionUrl, this.options);
        this.subForm.nosubmit = false;
        this.subForm.loadSubmission().then((sub) => this.setValue(sub, flags, true));
        return super.setValue(submission, flags);
      }
      else {
        return this.subForm ? this.subForm.setValue(submission, flags) : super.setValue(submission, flags);
      }
    }

    const changed = super.setValue(this._submission, flags);
    const hidden = this.isHidden();
    let subForm;
    if (hidden) {
      subForm = this.subFormReady;
    }
    else {
      subForm = this.loadSubForm();
    }
    subForm.then(() => this.setValue(this._submission, flags, true));
    return changed;
  }

  getValue() {
    if (this.subForm) {
      return this.subForm.getValue();
    }
    return this.dataValue;
  }

  getAllComponents() {
    if (!this.subForm) {
      return [];
    }
    return this.subForm.getAllComponents();
  }

  updateSubFormVisibility() {
    if (this.subForm) {
      this.subForm.parentVisible = this.visible;
    }
  }

  get visible() {
    return super.visible;
  }

  set visible(value) {
    super.visible = value;
    this.updateSubFormVisibility();
  }

  get parentVisible() {
    return super.parentVisible;
  }

  set parentVisible(value) {
    super.parentVisible = value;
    this.updateSubFormVisibility();
  }

  isInternalEvent(event) {
    switch (event) {
    case 'focus':
    case 'blur':
    case 'componentChange':
    case 'componentError':
    case 'error':
    case 'formLoad':
    case 'languageChanged':
    case 'render':
    case 'checkValidity':
    case 'initialized':
    case 'submit':
    case 'submitButton':
    case 'nosubmit':
    case 'updateComponent':
    case 'submitDone':
    case 'submissionDeleted':
    case 'requestDone':
    case 'nextPage':
    case 'prevPage':
    case 'wizardNavigationClicked':
    case 'updateWizardNav':
    case 'restoreDraft':
    case 'saveDraft':
    case 'saveComponent':
      return true;
    default:
      return false;
    }
  }

  createEmitter() {
    const emiter = new EventEmitter({
      wildcard: false,
      maxListeners: 0
    });
    const nativeEmit = emiter.emit;
    const that = this;

    emiter.emit = function(event, ...args) {
      const eventType = event.replace(`${that.options.namespace}.`, '');
      nativeEmit.call(this, event, ...args);

      if (!that.isInternalEvent(eventType)) {
        that.emit(eventType, ...args);
      }
    };

    return emiter;
  }

  deleteValue() {
    super.setValue(null, {
      noUpdateEvent: true,
      noDefault: true
    });
    _.unset(this.data, this.key);
  }
}
