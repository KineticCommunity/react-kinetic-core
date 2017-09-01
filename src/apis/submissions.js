import axios from 'axios';
import { bundle } from '../core-helpers';
import { handleErrors, paramBuilder } from './http';


const VALID_TIMELINES = ['closedAt', 'createdAt', 'submittedAt', 'updatedAt'];
const VALID_CORE_STATES = ['Draft', 'Submitted', 'Closed'];

export class SubmissionSearch {
  constructor() {
    this.searchMeta = {
      include: [],
    };

    this.query = [];
    this.queryContext = [];
    this.queryContext.push(this.query);
  }

  /*
   * Context Management
   */
  currentContext() {
    return this.queryContext[this.queryContext.length - 1];
  }

  addContext(context) {
    this.queryContext.push(context);
  }

  endContext() {
    return this.queryContext.pop();
  }

  /*
   * Execution Methods
   */

  build() {
    // Validate our attempt to search:
    this.validateOuter('Attempted to execute query before ending all groupings.');
    // * if core state it set to something other than draft we must have an
    //   beginning and ending date.
    // * ...?
    const query = this.compileQueryString();
    return {
      ...this.searchMeta,
      query,
    };
  }

  raw() {
    return this.query;
  }

  /*
   * Equality Methods
   */
  eq(lvalue, rvalue) {
    this.currentContext().push({ op: 'eq', lvalue, rvalue });
    return this;
  }

  in(lvalue, rvalue) {
    this.currentContext().push({ op: 'in', lvalue, rvalue });
    return this;
  }

  /*
   * Grouping Methods
   */
  or() {
    const op = { op: 'or', context: [] };
    this.currentContext().push(op);
    this.addContext(op.context);
    return this;
  }

  and() {
    const op = { op: 'and', context: [] };
    this.currentContext().push(op);
    this.addContext(op.context);
    return this;
  }

  end() {
    this.endContext();
    return this;
  }

  /*
   * Sorting Methods
   */

  sortBy(timeline) {
    this.validateOuter('Sorting cannot be nested.');
    // Check to see that timeline is in valid timelines.
    if (VALID_TIMELINES.includes(timeline)) {
      this.searchMeta.timeline = timeline;
    }

    return this;
  }

  sortDirection(direction) {
    this.validateOuter('Sorting cannot be nested.');
    if (direction !== 'ASC' && direction !== 'DESC') {
      throw new Error(`Invalid sort direction: ${direction}`);
    }

    this.searchMeta.direction = direction;
    return this;
  }

  type(type) {
    this.validateOuter('Type qualification cannot be nested');
    this.searchMeta.type = type;
    return this;
  }

  coreState(coreState) {
    this.validateOuter('Core State cannot be nested');
    if (!VALID_CORE_STATES.includes(coreState)) {
      throw new Error(`Invalid Core State "${coreState}". Expected: ${VALID_CORE_STATES.join()}`);
    }
    this.searchMeta.coreState = coreState;
    return this;
  }

  startDate(startDate) {
    this.validateOuter('Start Date cannot be nested.');
    if (!(startDate instanceof Date)) {
      throw new Error('Start Date must be a Date object.');
    }
    this.searchMeta.start = startDate.toISOString();
    return this;
  }

  endDate(endDate) {
    this.validateOuter('End Date cannot be nested.');
    if (!(endDate instanceof Date)) {
      throw new Error('End Date must be a Date object.');
    }
    this.searchMeta.end = endDate.toISOString();
    return this;
  }

  limit(limit) {
    this.validateOuter('Limit cannot be nested');
    this.searchMeta.limit = limit;
    return this;
  }

  pageToken(pageToken) {
    this.validateOuter('Page Token cannot be nested');
    this.searchMeta.pageToken = pageToken;
    return this;
  }

  include(include) {
    this.searchMeta.include.push(include);
    return this;
  }

  includes(includes) {
    const newIncludes = [...new Set([...this.searchMeta.include, ...includes])];
    this.searchMeta.include = newIncludes;
      // _.uniq(_.concat(this.searchMeta.include, includes));
    return this;
  }

  /*
   * Privately used utilities.
   */

  validateOuter(message) {
    if (this.queryContext.length > 1) {
      throw new Error(message);
    }
  }

  compileQueryString() {
    function doCompileQueryString(queryContext, queryString, and = true) {
      let query = `${queryString}`;

      queryContext.forEach((op, i) => {
        if (i > 0) {
          query += (and ? ' AND ' : ' OR ');
        }
        switch (op.op) {
          case 'eq':
            if (typeof op.rvalue === 'string' && op.rvalue === '') {
              query += `${op.lvalue} = null`;
            } else {
              query += `${op.lvalue} = "${op.rvalue}"`;
            }
            break;
          case 'in':
            query += `${op.lvalue} IN (`;
            op.rvalue.forEach((rval, rvi) => {
              if (rvi > 0) {
                query += ', ';
              }

              if (op.rvalue[rvi] === '' || op.rvalue[rvi] === null) {
                query += 'null';
              } else {
                query += `"${op.rvalue[rvi]}"`;
              }
            });
            query += ')';
            break;
          case 'or':
          case 'and':
            query += '( ';
            query += doCompileQueryString(op.context, '', (op.op === 'and'));
            query += ')';
            break;
          default:
            throw new Error(`Unexpected operator type "${op.op}" encountered. Expected: eq, in, or, and.`);
        }
      });

      return query;
    }

    return doCompileQueryString(this.query, '', true);
  }
}

export const searchSubmissions = (options) => {
  const {
    kapp,
    form,
    search,
  } = options;

  let path = '';
  if (typeof form !== 'undefined') {
    // Form scoped.
    path = `${bundle.apiLocation()}/kapps/${kapp || bundle.kappSlug()}/forms/${form}/submissions`;
  } else {
    // Kapp scoped.
    path = `${bundle.apiLocation()}/kapps/${kapp || bundle.kappSlug()}/submissions`;
  }

  const meta = { ...search };
  // Format includes.
  if (search.include.length > 0) {
    meta.include = search.include.join();
  }

  delete meta.query;
  if (typeof search.query === 'string' && search.query.length > 0) {
    meta.q = search.query;
  }

  // Fetch the submissions.
  let promise = axios.get(path, {
    params: { ...meta, ...paramBuilder(options) },
  });

  // Remove the response envelop and leave us with the submissions.
  promise = promise.then(response => ({
    submissions: response.data.submissions,
    messages: response.data.messages,
    nextPageToken: response.data.nextPageToken,
  }));

  // Clean up any errors we receive. Make srue this is the last thing so that it
  // cleans up all errors.
  promise = promise.catch(handleErrors);

  return promise;
};

export const fetchSubmission = (options) => {
  const { id } = options;

  if (!id) {
    throw new Error('fetchSubmission failed! The option "id" is required.');
  }

  return axios.get(`${bundle.apiLocation()}/submissions/${id}`, { params: paramBuilder(options) })
    // Remove the response envelop and leave us with the submission one.
    .then(response => ({ submission: response.data.submission }))
    // Clean up any errors we receive. Make sure this the last thing so that it
    // cleans up any errors.
    .catch(handleErrors);
};

export const createSubmission = (options) => {
  const {
    kappSlug = bundle.kappSlug(),
    formSlug,
    values,
    completed = true,
  } = options;

  if (!formSlug) {
    throw new Error('createSubmission failed! The option "formSlug" is required.');
  } else if (!values) {
    throw new Error('createSubmission failed! The option "values" is required.');
  }

  const path = `${bundle.apiLocation()}/kapps/${kappSlug}/forms/${formSlug}/submissions`;
  const params = { ...paramBuilder(options), completed };

  return axios.post(path, { values }, { params })
    // Remove the response envelop and leave us with the submission one.
    .then(response => ({ submission: response.data.submission }))
    // Clean up any errors we receive. Make sure this the last thing so that it
    // cleans up any errors.
    .catch(handleErrors);
};

export const deleteSubmission = (options) => {
  const { id } = options;

  if (!id) {
    throw new Error('deleteSubmission failed! The option "id" is required.');
  }

  return axios.delete(`${bundle.apiLocation()}/submissions/${id}`, { params: paramBuilder(options) })
    // Remove the response envelop and leave us with the submission one.
    .then(response => ({ submission: response.data.submission }))
    // Clean up any errors we receive. Make sure this the last thing so that it
    // cleans up any errors.
    .catch(handleErrors);
};
