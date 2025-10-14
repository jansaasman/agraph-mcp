
{remark -*- indent-tabs-mode: nil; buffer-file-coding-system: utf-8-unix -*- }
{include resources/standard-header.md}
{set-property title "HTTP Protocol | AllegroGraph {property agraph-version}"}
{set-property markdown-body-id "http-protocol"}

# AllegroGraph {property agraph-version} HTTP Protocol

</div> 

<div id="contents">
{include resources/include-navigation.md}
{table-of-contents :start 2 :depth 2 :label "Table of Contents"}

<div id="main-content">

Communication between an [AllegroGraph][ag] server and other processes
happens through [HTTP][http]. This document describes the HTTP entry
points the server provides, and how to use them. Most people will
prefer to use a client library written in their language of choice to
communicate with the server, but when no such library exists, or there
is a reason not to use one, working directly with HTTP is an option.

The protocol described here is compatible (is a superset of) with the
[Sesame 2.0 HTTP protocol][seshttp] and the W3C [SPARQL
protocol][sparqlprot] (*SPARQL endpoint*).

[ag]: http://agraph.franz.com/allegrograph/
[http]: http://www.w3.org/Protocols/rfc2616/rfc2616.html
[seshttp]: http://archive.rdf4j.org/system/ch08.html
[sparqlprot]: http://www.w3.org/TR/sparql11-protocol/


@(overview)

## Overview

An AllegroGraph server exposes one or more catalogs, each containing
any number of repositories (triple stores). The catalog layout of a
server, as well as the port on which it listens for HTTP connections,
is defined through its [configuration file][daemon-config].

When the server is running, for example on the default port 10035, a
catalog named `public` would be available under
`http://localhost:10035/catalogs/public`, whereas the root catalog
lives at `http://localhost:10035/catalogs/root`, which can be
shortened to `http://localhost:10035/` since `catalogs/root` is the
default. Repository `people` in root catalog would thus be accessible
at `http://locahost:10035/repositories/people`, while repository
`data` in `public` catalog would be accessible at
`http://localhost:10035/catalogs/public/repositories/data`. Opening
these URLs in a browser will present you with [WebView][newwebview], a
web-interface to the catalogs and repositories (and the server in
general), while repository endpoint's `query` parameter can be used to
execute SPARQL queries:

    http://localhost:10035/repositories/people?query=<SPARQL query>

To manipulate or inspect the repositories directly, more specific
[URLs](#urls) have to be constructed. For example, requesting this URL
tells you how many statements (triples) there are in the repository
`people`:

    http://localhost:10035/repositories/people/size

## HTTP vs HTTPS

The *scheme* used by AllegroGraph is either HTTP or HTTPS. All the
examples in this document and the related [HTTP
reference][http-reference] document use HTTP but HTTPS can be used
when the port is an SSL port. There are configuration directives
listed in the [Server Configuration and Control][daemon-config]
document which control which scheme is associated with which
port. The three most relevant directives are:

* **Port**: the port for HTTP interaction. If unspecified, defaults to 10035.

* **AllowHTTP**: a boolean (values `yes` or `no`) which controls whether
  HTTP communication is allowed. If `yes` (the default), HTTP can be
  used and communication uses the value of the `Port` directive
  described above. If `no`, then there must be a value for SSLPort and
  only HTTPS communication is allowed. Note that both HTTP and HTTPS
  communication can be allowed, using Port and SSLPort respectively if
  `AllowHTTP` is `yes` and a value of SSLPort is specified.

* **SSLPort**: The port for HTTPS communication. If this directive is
  specified, additional directives are required, such as, at a
  minimum, `SSLCertificate`. See the section [Top-level directives for
  SSL client certificate
  authentication](daemon-config.html#TopLevelSSL) in the [Server
  Configuration and Control][daemon-config] document for more
  information.

@(conventions)

## Conventions

The AllegroGraph server tries to make effective use of HTTP features
such as content-negotiation, status codes, and request methods. As
such, a good understanding of the ideas behind HTTP will help when
working with this protocol.

@(input)

### Input conventions 

Unless noted otherwise, the services that take parameters expect these
to be appended to the URL as a [query string][querystring] — as in
`?name=John%20Doe`. For `POST` requests that send along a
`Content-Type` header of `application/x-www-form-urlencoded`, the
query string can also be put in the request body. Any 'dynamic' part
of a URL (for example the repository name) should also be URL-encoded
— specifically, slashes should be encoded as `%2F`.

When making a `PUT` or `POST` request that includes a body, it is
usually required to specify a meaningful `Content-Type` for this body.

When RDF terms have to be passed as parameters, or included in
JSON-encoded data, these are written in a format resembling
[N-triples][n-triples-format], with the caveat that non-ASCII characters are
allowed. Examples of valid terms are `<http://example.com/foo>`,
`"literal value"`, `"55"^^<http://www.w3.org/2001/XMLSchema#integer>`.

Any boolean values passed as parameters should be represented by the
strings "true" or "false". Also accepted as equivalents for "true" are
"t", "y", "yes" and "1" and as equivalents for "false" are "nil", "n",
"no" and "0". Other values signal an error:

    curl -u test:xyzzy -X POST \
	http://127.1:10035/repositories/r/indices/optimize?wait=nope
    INVALID PARAMETERS: 'nope' is not a valid boolean.

All non-ASCII input to the server should be encoded using
[UTF-8][utf8]. When such characters end up a URL, the individual bytes
of their UTF-8 representation should be taken and escaped as normal
(`%HH`).

If there is the need to send data to the server in compressed form, a
[Content-Encoding][ce] header can be provided along with an encoded
request body. The server understands `deflate` and `gzip` encoding on
all platforms, and `bzip2` on platforms that provide the `bzcat`
utility (most Unixes).

When making a request without an `Authorization` header, the request
is treated as coming from [user](#users) `anonymous` (if such a user
exists). Either [Basic HTTP authentication][auth] or a certificate
signed by a CA that the server accepts must be used to identify
oneself as another user.

@(output)

### Output conventions 

The server always looks at the [Accept][acc] header of a request, and
tries to generate a response in the format that the client asks for.
If this fails, a [406][406] response is returned. When no `Accept`, or
an `Accept` of `*/*` is specified, the server prefers `text/plain`, in
order to make it easy to explore the interface from a web browser.

Almost every service is capable of returning `text/plain` (just text)
and `application/json` ([JSON][json]-encoded) responses. Services
returning sets of triples can return the following:

 * `application/rdf+xml` ([RDF/XML][rdf-xml-format])
 * `text/plain` ([N-triples][n-triples-format])
 * `text/x-nquads` ([N-quads][n-quads-format])
 * `application/trix` ([TriX][trix-format])
 * `text/rdf+n3` ([N3][n3])
 * `text/integer` (return only a result count)
 * `application/x-binary-rdf-results-table` (RDF-star capable binary format
   					     used by RDF4J)
 * `application/json`, `application/x-quints+json` (see below)

When encoding RDF triple sets as [JSON][json], arrays of strings are
used. The strings contain terms in a format that is basically
[N-triples][n-triples-format] with non-ASCII characters allowed (the server always
uses UTF-8 encoding). Arrays of three elements are triples (subject,
predicate, object) in the default graph. Arrays of four elements also
contain a graph name (context) as the fourth element. The
`application/x-quints+json` format works like the JSON triple format,
but adds an extra field, the triple ID, to the front of every triple.

Services returning lists or sets of results (SPARQL `select` queries,
for example) support the `application/sparql-results+xml` ([see
here][xmlres]) and `application/sparql-results+json` ([see
here][sparqljson]) format. When encoded as regular JSON
(`application/json`), such results take the form of an object with two
properties. `names` contains an array of column labels, and `values`
an array of arrays of values — the result rows. Again, `text/integer`
will cause only the number of results to be returned.

When asked to (using the [Accept-Encoding][ae] header), the server
will compress the response body using 'gzip' or 'deflate'. For typical
RDF data, this will make the response *a lot* smaller.


@(error)

### Error responses 

Error responses will choose the appropriate [HTTP status code][status]
as much as possible. Since there are a lot of circumstances that
result in `400 Bad Request`, those are (usually) tagged with an
additional error code. This code will be a capitalized string at the
start of the body, followed by a colon, a space, and then a more
detailed description of the problem.

The above paragraph says 'usually', since in the case of *really*
malformed requests, the HTTP server implementation underlying the
AllegroGraph server can also return a `400` response, which won't
include such an error code. Thus, clients shouldn't recklessly assume
the code is present, but could, for example, match against the regular
expression `/^([A-Z ]+): (.*)$/` to separate the code from the message.

Error codes will be one of the following:

`INVALID PARAMETERS`
: The set of parameters passed to the request, or the value of one of
  them, is not valid for this service.

`MALFORMED QUERY`
: An unsyntactic query was given.

`MALFORMED DATA`
: The request contains unsyntactic data.

`MALFORMED PROGRAM`
: A Lisp program included in the request could not be executed.

`UNSUPPORTED QUERY LANGUAGE`
: A query language was specified that is not understood by this
  server.

`UNSUPPORTED FILE FORMAT`
: Data was provided in a format that the server does not understand.

`INAPPROPRIATE REQUEST`
: The request expresses something wrong-headed, like writing to a
  federated store.

`PRECONDITION FAILED`
: A necessary precondition for executing the request does not hold.

`NOT IMPLEMENTED`
: The request tries to use functionality that is not implemented.

`COMMIT FAILED`
: A transaction-conflict between the request and other, concurrent
  transactions arose. This can only happen when changing a
  repository's meta-data (things like [type mappings](#mapping)).

[status]: http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html

@(cors)

## CORS support

CORS (Cross-Origin Resource Sharing), if enabled, allows scripts run
on a web page on some other web server than AllegroGraph's web
server. CORS is not enabled by default because if not done properly,
it can introduce security holes. A general tutorial on CORS is
available at
[http://www.html5rocks.com/en/tutorials/cors/](http://www.html5rocks.com/en/tutorials/cors/).
CORS is enabled with top-level configuration directives, which go in
the AllegroGraph configuration file. AllegroGraph must be restarted
for changes to that file to take effect. The CORS directives are
described [here](daemon-config.html#cors) in the [Server Configuration
and Control][daemon-config] document.


@(example)

## Example session

What follows is an example session. For clarity, all headers related
to authorization, caching, connection keep-alive, and content chunking
have been left out.

First, to create a repository named `test`, we'd issue the following request:

    PUT /repositories/test HTTP/1.1
    Accept: */*

To which the server responds:

    HTTP/1.1 204 No Content

We can now list the repositories in the root catalog, asking for JSON
content:

    GET /repositories HTTP/1.1
    Accept: application/json

    HTTP/1.1 200 OK
    Content-Type: application/json; charset=UTF-8
    
    [{"uri": "<http://localhost:10035/repositories/test>",
      "id": "\"test\"",
      "title": "\"test\"",
      "readable": true
      "writeable": true}]

Next, let's add a few statements to this store...

    POST /repositories/test/statements HTTP/1.1
    Accept: */*
    Content-Type: application/json
    
    [["<http://example.org#alice>", "<http://example.org#name>", "\"Alice\""],
     ["<http://example.org#bob>", "<http://example.org#name>", "\"Bob\""]]

    HTTP/1.1 204 No Content

Or, doing the same using N-triples instead of JSON:

    POST /repositories/test/statements HTTP/1.1
    Accept: */*
    Content-Type: text/plain
    
    <http://example.org#alice> <http://example.org#age> "26" .
    <http://example.org#bob> <http://example.org#age> "33" .

To find out Alice's name and age, we could issue the following SPARQL
query:

    select ?n ?age {
      <http://example.org#alice> <http://example.org#name> ?n ;
                                 <http://example.org#age ?age
    }

In the following request, `[QUERY]` is the URL-encoded equivalent of
this query:

    GET /repositories/test?query=[QUERY] HTTP/1.1
    Accept: application/json

    HTTP/1.1 200 OK
    Content-Type: application/json; charset=UTF-8
    
    {"names":["n", "age"], "values":[["\"alice\"", "\"26\""]]}

Or, asking for SPARQL XML results:

    GET /repositories/test?query=[QUERY] HTTP/1.1
    Accept: application/sparql-results+xml

    HTTP/1.1 200 OK
    Content-Type: application/sparql-results+xml; charset=UTF-8
    
    <?xml version="1.0"?>
    <sparql xmlns="http://www.w3.org/2005/sparql-results#">
      <head><variable name="n"/><variable name="age"/></head>
      <results>
        <result>
          <binding name="n"><literal>alice</literal></binding>
          <binding name="age"><literal>26</literal></binding>
        </result>
      </results>
    </sparql>

To fetch all statements in a repository, issue a request like this:

    GET /repositories/test/statements
    Accept: text/plain

    HTTP/1.1 200 OK
    Content-Type text/plain
    
    <http://example.org#alice> <http://example.org#name> "Alice" .
    <http://example.org#bob> <http://example.org#name> "Bob" .
    <http://example.org#alice> <http://example.org#age> "26" .
    <http://example.org#bob> <http://example.org#age> "33" .

And finally, if we submit a nonsense query, we get:

    GET /repositories/test?query=hello&queryLn=english HTTP/1.1
    Accept: */*

    HTTP/1.1 400 Bad Request
    Content-Type: text/plain; charset=UTF-8
    
    UNSUPPORTED QUERY LANGUAGE: Unsupported query language: 'english'

@(urls)

## URL summary

<style type="text/css">
  .url-list \{font-size: .8em\}
  .url-list ul \{list-style: none; margin-left: 1.5em; padding-left: 0}
  .url-list code \{font-weight: bold; font-size: 120%\}
</style>

The following overview gives a summary of a subset
of the URLs exposed by the server, and the methods allowed on
them. Each method links to a description of the functionality
exposed. See [HTTP reference][http-reference] for a complete list of
supported services.

<div class="url-list">

* `/auditLog` [GET](#get-audit-log)
    * `/eventTypes` [GET](#get-audit-event-types)
* `/catalogs` [GET](#get-catalogs)
    * `/[name]` [PUT](#put-catalog) [DELETE](#delete-catalog)
* `/version` [GET](#get-version)
    * `/date` [GET](#get-version-date)
* `/reconfigure` [POST](#post-reconfigure)
* `/reopenLog` [POST](#post-reopenlog)
* `/initfile` [GET](#get-initfile) [PUT](#put-initfile) [DELETE](#delete-initfile)
* `/scripts` [GET](#get-sitescripts)
    * `/[name]` [GET](#get-sitescript) [PUT](#put-sitescripts) [DELETE](#delete-sitescripts)
* `/users` [GET](#get-users)
    * `/[name]` [PUT](#put-user) [DELETE](#delete-user)
        * `/password` [POST](#post-password)
        * `/password/expired` [GET](#get-password-expired)
        * `/password/expired` [POST](#post-password-expired)
        * `/roles` [GET](#get-user-roles)
            * `/[role]` [PUT](#put-user-role) [DELETE](#delete-user-role)
        * `/permissions` [GET](#get-user-permissions)
            * `/[type]` [PUT](#put-user-permission) [DELETE](#delete-user-permission)
        * `/effectivePermissions` [GET](#get-user-effective-permissions)
        * `/access` [GET](#get-user-access) [PUT](#put-user-access) [DELETE](#delete-user-access)
        * `/effectiveAccess` [GET](#get-user-effective-access)
        * `/data` [GET](#get-user-data)
            * `/[key]` [GET](#get-user-data-key) [PUT](#put-user-data-key) [DELETE](#delete-user-data-key)
        * `/security-filters` [GET](#get-user-security-filters) [POST](#post-user-security-filters) [DELETE](#delete-user-security-filters)
        * `/suspended` [GET](#get-user-suspended) [POST](#post-user-suspended) [DELETE](#delete-user-suspended)
        * `/enabled` [GET](#get-user-enabled) [POST](#post-user-enabled) [DELETE](#delete-user-enabled)
* `/roles` [GET](#get-roles)
    * `/[role]` [PUT](#put-role) [DELETE](#delete-role)
        * `/permissions` [GET](#get-role-permissions)
           * `/[type]` [PUT](#put-role-permission) [DELETE](#delete-role-permission)
        * `/access` [GET](#get-role-access) [PUT](#put-role-access) [DELETE](#delete-role-access)
        * `/security-filters` [GET](#get-role-security-filters) [POST](#post-role-security-filters) [DELETE](#delete-role-security-filters)
* `/processes` [GET](#get-processes)
    * `/[id]` [GET](#get-process) [DELETE](#delete-process)
        * `/telnet` [POST](#post-telnet)
* `/session` [POST](#post-session)
* `/jobs` [GET](#get-jobs)
* `/jobs` [DELETE](#delete-jobs)

</div>

Under a catalog prefix (`/` for the root catalog, `/catalogs/[name]/`
for named catalogs), the following services are available:

<div class="url-list">

* `/protocol` [GET](#get-protocol)
* `/repositories` [GET](#get-repositories)
    * `/[name]` [GET](#get-post-repo) [POST](#get-post-repo) [PUT](#put-repo) [DELETE](#delete-repo)
        * `/ensureNotLingering` [POST](#ensure-not-lingering)
        * `/size` [GET](#get-size)
        * `/statements` [GET](#get-statements) [POST](#put-post-statements) [PUT](#put-post-statements)
          [DELETE](#delete-statements)
            * `/query` [GET](#get-post-statements-query) [POST](#get-post-statements-query)
            * `/delete` [POST](#post-statements-delete)
            * `/id` [GET](#get-statements-id)
            * `/duplicates` [GET](#get-statements-duplicates) [DELETE](#delete-statements-duplicates)
        * `/unique/[column]` [GET](#get-post-unique) [POST](#get-post-unique)
        * `/suppressDuplicates` [GET](#get-suppress-duplicates) [PUT](#put-suppress-duplicates) [DELETE](#delete-suppress-duplicates)
        * `/queries/[id]` [GET](#get-post-prepared) [POST](#get-post-prepared) [PUT](#put-prepared)
          [DELETE](#delete-prepared)
        * `/contexts` [GET](#get-contexts)
        * `/functor` [POST](#post-functor)
        * `/begin` [POST](#post-begin)
        * `/commit` [POST](#post-commit)
        * `/rollback` [POST](#post-rollback)
        * `/eval` [POST](#post-eval)
        * `/freetext` [GET](#get-post-freetext) [POST](#get-post-freetext)
            * `/indices` [GET](#get-freetext-indices)
                * `/[index]` [GET](#get-freetext-index) [DELETE](#delete-freetext-index) [PUT](#put-freetext-index)
                  [POST](#post-freetext-index)
                    * `/[param]` [GET](#get-freetext-param)
        * `/mapping` [GET](#get-mapping) [DELETE](#delete-mapping)
            * `/type` [GET](#get-typemapping) [POST](#post-put-typemapping) [PUT](#post-put-typemapping)
              [DELETE](#delete-typemapping)
            * `/predicate` [GET](#get-predmapping) [POST](#post-put-predmapping) [PUT](#post-put-predmapping)
              [DELETE](#delete-predmapping)
        * `/indices` [GET](#get-indices)
            * `/[type]` [PUT](#put-index) [DELETE](#delete-index)
            * `/optimize` [POST](#post-indices-optimize)
        * `/blankNodes` [POST](#post-blanknodes)
        * `/tripleCache` [GET](#get-triplecache) [PUT](#put-triplecache) [DELETE](#delete-triplecache)
        * `/namespaces` [GET](#get-namespaces) [DELETE](#delete-namespaces)
            * `/[prefix]` [GET](#get-namespace) [PUT](#put-post-namespace) [POST](#put-post-namespace)
              [DELETE](#delete-namespace)
        * `/geo`
            * `/types` [GET](#get-geotypes)
                * `/cartesian` [POST](#put-geotype-cartesian)
                * `/spherical` [POST](#put-geotype-spherical)
            * `/box` [GET](#get-geo-box)
            * `/circle` [GET](#get-geo-circle)
            * `/haversine` [GET](#get-geo-haversine)
            * `/polygon` [GET](#get-geo-polygon) [PUT](#put-geo-polygon)
        * `/attributes/[name]` [GET](#get-attributes) [POST](#post-attributes) [DELETE](#delete-attributes)
            * `/attributes/staticFilter` [GET](#get-staticfilter) [POST](#post-staticfilter) [DELETE](#delete-staticfilter)
        * `/snaGenerators/[name]` [PUT](#put-generator)
        * `/neighborMatrices/[name]` [PUT](#put-matrix)
        * `/noCommit` [GET](#get-no-commit) [PUT](#put-delete-no-commit) [DELETE](#put-delete-no-commit)
        * `/bulkMode` [GET](#get-bulkmode) [PUT](#put-delete-bulkmode) [DELETE](#put-delete-bulkmode)
        * `/warmstandby` [GET](#get-warmstandby)  [PUT](#put-warmstandby) [DELETE](#delete-warmstandby)
            * `/switchRole` [POST](#post-warmstandby-switchrole)
        * `/session` [POST](#post-store-session)
        * `/mongoParameters` [GET](#get-mongoParameters) [POST](#post-mongoParameters)
        * `/materializeEntailed` [PUT](#put-materialize) [DELETE](#delete-materialize) 
        * `/custom/[name]` [(see here)](#custom)

</div>

## Global URLs

{include sources/include-get-auditlog-1.md}

Auditing is described in [Auditing][audit]. The information above is
repeated in that document.


{include sources/include-get-auditlog-2.md}

Auditing is described in [Auditing][audit]. The information above is
repeated in that document.

{include sources/include-get-auditlog-3.md}


@(get-catalogs)

### GET /catalogs 

Returns a set of catalogs that are available on this server. For each
catalog, `id` and `uri` properties are returned, giving respectively
the name of the catalog and the URL under which it is found.
Properties name `readable` and `writable` indicate, for each catalog,
whether the user has read or write access to it.

@(put-catalog)

### PUT /catalogs/[name] 

If dynamic catalogs are enabled for the server (see the
[`DynamicCatalogs`](daemon-config.html#DynamicCatalog) directive),
this can be used to create a new catalog. Takes an `expectedStoreSize`
(integer) parameter, which sets the default [expected
size][daemon-config] parameter for this catalog. Dynamic catalogs
can also be created with the [agtool catalogs](agtool.html#catalogs) tool.

@(delete-catalog)

### DELETE /catalogs/[name] 

Deletes a catalog. Only dynamic catalogs (those created through HTTP)
can be deleted in this way. Dynamic catalogs can also be deleted with
the [agtool catalogs](agtool.html#catalogs) tool. Deleting a dynamic
catalog also deletes all the repos it contains.

@(get-version)

### GET /version 

Returns the version of the AllegroGraph server, as a string. For
example `4.0`.

@(get-version-date)

### GET /version/date 

Return the date on which the server was built.

@(get-version-revision)

### GET /version/revision 

Return the [git][git] hash of the revision that the server was built
from.

[git]: http://git-scm.com/

@(post-reconfigure)

### POST /reconfigure 

Posting to this URL will cause the server to re-read its configuration
file, and update itself to reflect the new configuration.

@(post-reopenlog)

### POST /reopenLog 

Causes the server to re-open its log file. This is useful for log
rotation.

@(get-jobs)

### GET /jobs 

Returns lists of strings of the form ("uuid" "age" "description"
[unused]), where "uuid" is the job UUID; "age" is the time since the
job was created, in seconds; and "description" is the query
string. Only query jobs are returned. The fourth element of the list
will also be a string but is not currently used and so is not
meaningful. Specifying a content-type of `application/json` will
return the lists in JSON format.

@(delete-jobs)

### DELETE /jobs 

Requires a single parameter, job UUID, which specifies the
id of the job to cancel. Cancels the specified job.

@(scripting)

## Scripting the server

AllegroGraph supports server-side scripting in both Common Lisp and
[JavaScript][javascript]. Typical uses of such scripts include
defining [Prolog functors](#post-functor), creating [custom
services](#custom), and defining [stored procedures][stored-procedures].

Before scripts can be used by AllegroGraph, they must first be uploaded
to the server. Scripts that are intended for site-wide use are referred
to as *Sitescripts*. Scripts that are intended for use with a specific
repository only are referred to as *Reposcripts*.

Scripts that have a '.js' extension will be interpreted as
Javascript source. Any other filename will be assumed to contain
Common Lisp source, with the exception of files having a '.fasl'
extension. Common Lisp source files will be compiled before being
loaded and executed. Files with a .fasl extension are assumed to
contain compiled Common Lisp code, and they will only be loaded. You
are responsible for ensuring that fasl files are compatible with the
server. (Note that fasl files from one version of Allegro CL
cannot, in general, be loaded into a different version.)  The default
package for Common Lisp source is the `db.agraph.user` package. Once
loaded, a script will not be reloaded unless the source file on the
server has a modification date later than the time at which the last
load of said script occurred.

Scripting is a powerful feature. As such, superuser permission is
required in order to upload Sitescripts, while write access to a
repository is necessary to upload Reposcripts.

Once scripts have been uploaded to the server, they may be loaded and
used to interact with data stored in AllegroGraph. There are two ways
to load scripts: specifying them in a 'script' query parameter when
starting a [dedicated session](#sessions), or including an 'x-scripts'
header along with your HTTP request (x-scripts headers will cause 
scripts to be loaded for any request that operates on a valid
repository). The value of the header is a comma-separated list of
script names. Both Sitescripts and Reposcripts can be specified. In
the event that both a Sitescript and a Reposcript have the same name,
in most cases, the Reposcript will be loaded. Federated triple-stores
will only load Sitescripts, since they, by definition, operate on
multiple repositories.

While scripts may be loaded into shared back-ends, it is _highly_
recommended that scripts only be used with dedicated sessions. Please
read the section on [Sessions](#sessions) for further details.

### Sitescript API

@(get-sitescripts)

### GET /scripts

Return the list of Sitescripts currently on the server. When a user
creates a session, they can choose to load one or more of these scripts
into the session.

@(get-sitescript)

### GET /scripts/[path]

Return the contents of the Sitescript with the given name.

@(put-sitescripts)

### PUT /scripts/[path]

Add or replace the named Sitescript. The body of the request should
contain the new script. Scripts that have a '.js' extension will be
interpreted as Javascript source. Scripts whose name ends
in .fasl are assumed to be compiled Lisp code (you are responsible for
ensuring that it is compatible with the server), anything else is
assumed to be Common Lisp source, which the server will compile.

@(delete-sitescripts)

### DELETE /scripts/[path]

Delete the Sitescript with the given name.

### Reposcript API

@(get-reposcripts)

### GET /repositories/[name]/scripts

Return the list of Reposcripts currently on the server for the named
repository. When a user creates a session, they can choose to load one
or more of these scripts into the session.

@(get-reposcript)

### GET /repositories/[name]/scripts/[path]

Return the contents of the Reposcript with the given name.

@(put-reposcript)

### PUT /repositories/[name]/scripts/[path]

Add or replace the named Reposcript. The body of the request should
contain the new script. Scripts that have a '.js' extension will be
interpreted as containing Javascript source. Scripts whose name ends
in .fasl are assumed to be compiled Lisp code (you are responsible for
ensuring that it is compatible with the server), anything else is
assumed to be Common Lisp source, which the server will compile.

@(delete-reposcript)

### DELETE /repositories/[name]/scripts/[path]

Delete the Reposcript with the given name.

@(get-initfile)

### GET /initfile

An initialization-file can be specified for a server, which is a
collection of Common Lisp code that is executed in every shared
back-end (see [below](#sessions)) as it is created. This retrieves
that file.

@(put-initfile)

### PUT /initfile

Replace the current initialization file with the body of the request.
Takes one boolean parameter, `restart`, which defaults to true, and
specifies whether any running shared back-ends should be shut down, so
that subsequent requests will be handled by back-ends that include the
new code.

@(delete-initfile)

### DELETE /initfile

Remove the server's initialization file.

@(custom)

### Defining Custom Services 

To be able to provide an HTTP interface to scripted programs,
AllegroGraph provides a special macro that allows one to easily define
HTTP services. Services created this way will be available under the
`/custom/[name]` suffix of a store. They will run with
`db.agraph:*db*` bound to the store. For example:

    (in-package #:db.agraph.user)

    (custom-service
        :get "r" "talk-about-me" :triple-cursor ()
      (let ((me (upi !<http://example.com/me>)))
        (db.agraph.cursor:make-transform-cursor (get-triples)
          (lambda (triple) (setf (subject triple) me) triple))))

This, when put into the initfile, will cause
`/repositories/x/custom/talk-about-me` to return all triples in that
store, with their subjects replaced by `<http://example.com/me>`.

The macro arguments look like this:

    (methods permissions name result-type arguments &body body)

`methods`
: Should be either one of `(:get :post :put :delete), or a list of
  them. Indicates the HTTP methods on which this service is reacheable.

`permissions`
: Should be a string containing zero or more of the characters
  `rwWes`, indicating the permissions needed by a user to access this
  service. `r` stands for read, `w` for write, `e` for eval, and `s`
  for superuser. A capital `W` indicates that this service will mutate
  the store.

`name`
: The name of the service. Can be any string.

`result-type`
: The type of the value the service returns. This has to be known in
  order for the server to be able to do content-negotiation, and to be
  able to write the value out in all suitable formats. Allowed types
  are `:string`, `:integer`, `:float`, `:boolean`, `:list` (list of
  strings or triple-parts), `:json` (anything serializeable as JSON,
  using [ST-JSON][stjson]), or `:triple-cursor` (an AllegroGraph-style
  cursor). You can specify `:dynamic` here if you want the server to
  look at the returned value and dynamically determine a suitable
  output format.

`arguments`

: A list of argument specifications, each in the form `(name type)`
  for a required argument (for example `(username :string)`), or
  `(name type :default DEFAULT-VALUE)` for an optional argument
  (for example `(size :integer :default 100)`).  Since all arguments
  must have a value when a request is processed, optional arguments
  must have a default value specified.
  The arguments will be extracted from the HTTP
  request, and bound to the given variable names. As type, one can
  specify `:string`, `:integer`, `:float`, `:boolean` (`true` or
  `false`), `:list` (for arguments that can be specified multiple
  times), `:body` (the request body), `:method` (the request method),
  or `:content-type` (the content-type specified for the request
  body). Arguments are checked, so requests that leave off arguments
  for which no default is specified, or pass something that can't be
  interpreted as the correct type, will return an error response
  before the service body is even run.

`body`
: This is the code that gets run to produce the service's response
  value. It will run with the argument names bound to their values.

[stjson]: http://marijn.haverbeke.nl/st-json/

{anchor put-materialize-entailed}

## OWL 2 RL Materialization

@(put-materialize)

### PUT /repositories/[name]/materializeEntailed  

Adds or replaces materialized triples in the store that are generated
by entailment. This allows reasoning queries over the store without
turning reasoning on at query time. By default the materializer only
entails triples according to RDFS++ rules. Additional rules can be
specified. Returns an integer count of the number of entailed triples
added. See [Materializer][materializer] for more information.

* __with__ - This parameter can be specified multiple times to select
  additional rules for the materializer. See [materialize-entailed-triples](materializer.html#materialize-entailed-triples) in [Materializer][materializer] for possible rulesets.

* __without__ - This parameter can be specified multiple times to deselect
  rules for the materializer. If without appears sans the "with"
  parameter, then it is assumed all rules except those specified by
  without will be used. Again see [materialize-entailed-triples](materializer.html#materialize-entailed-triples) in [Materializer][materializer].

* __useTypeSubproperty__ - A boolean which defaults to false. When true
  and possible, the materializer prefers using types which are
  rdfs:subPropertyOf rdf:type in entailed triples rather than using
  rdf:type directly.

* __commit__ - A positive integer. Will cause a commit to happen after every N added statements. Can be used to work around the fact that committing a huge amount of statements in a single transaction will require excessive amounts of memory.


@(delete-materialize)

### DELETE /repositories/[name]/materializedEntailed 

Deletes any previously materialized triples. Return an integer count
of the number of materialized triples removed.


@(users)

## User management

The AllegroGraph server uses a simple access-control scheme. Requests
made with a valid [`Authorization`][authoriz] header get assigned to
the authorized user. Each user has a set of permissions, which are
used to determine whether the request can be made.

@(anonymous)The user named `anonymous` plays a special role. When such
a user exists, any request made without authentication information is
assigned to that user. By default, no anonymous user is defined, which
disallows anonymous access.

The following permissions flags are defined:

`super`
: This flag makes one a superuser, which means one can manage user
  accounts. Having the `super` permission automatically grants all
  other permissions.

`eval`
: This controls whether a user is allowed to use the
  '[eval-in-server](#post-eval)' entry point, and use arbitrary Lisp
  code in their Prolog queries. This makes it possible to write more
  powerful queries, and move work to the server to improve efficiency.
  Note, however, that this also allows all manner of privilege
  escalation, and should only be granted to trusted users.

`session`
: Controls whether a user can open their own [sessions](#sessions).

On top of that, `read` and `write` access can be specified per catalog
and per store (as well as globally). `read` access allows one to query
a repository, with `write` access one can also modify it. At the
catalog level, `write` access permits the deleting and creating of
repositories.

Each user can be assigned to a set of [roles](#get-roles), each of
which can also be granted permissions. The effective set of
permissions that a user has is the union of their own permissions and
those of their roles.

Most of the user-management services are only available to
super-users. A normal user is allowed to inspect its own permissions,
the status of its account, manage its user-data, and delete its own
account.

[authoriz]: http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.8

@(get-users)

### GET /users 

Returns a list of names of all the users that have been defined. For
example:

    GET /users HTTP/1.1
    Accept: application/json

    HTTP/1.1 200 OK
    Content-Type: application/json; charset=UTF-8
    
    ["anonymous", "marijnh", "testuser"]

@(put-user)

### PUT /users/[name] 

Create a new user. Expects a `password` parameter, which specifies the
user's password (can be left off when creating the
[anonymous](#anonymous) user).

@(delete-user)

### DELETE /users/[name] 

Delete a user.

@(post-password)

### POST /users/[name]/password 

Change the password for the given user. The new password should be in
the body of the request.

@(get-password-expired)

### GET /users/[name]/password/expired 

Return a boolean indicating whether the user's password is expired.

@(post-password-expired)

### POST /users/[name]/password/expired 

Expire the user's password. If the password is expired, then any
attempt to log in will result in HTTP error 401 with the message
"Password expired.". However, an exception is made for changing one's
own password: it can be done with an expired password. Changing the
password cancels the expired status.

@(get-user-roles)

### GET /users/[name]/roles 

Retrieves a list of names, indicating the roles this user has.

@(put-user-role)

### PUT /users/[name]/roles/[role] 

Add a role to a user.

@(delete-user-role)

### DELETE /users/[name]/roles/[role] 

Remove a role from a user. For example:

    DELETE /users/anonymous/roles/project_a HTTP/1.1

@(get-user-permissions)

### GET /users/[name]/permissions 

List the permission flags that have been assigned to a user (any of
`super`, `eval`, `session`). This is what a request fetching
permission flags as plain text looks like:

    GET /users/marijnh/permissions
    Accept: text/plain

    HTTP/1.1 200 OK
    Content-Type: text/plain; charset=UTF-8
    
    eval
    session

@(get-user-effective-permissions)

### GET /users/[name]/effectivePermissions 

Retrieve the permission flags assigned to the user, or any of its
roles.

@(put-user-permission)

### PUT /user/[name]/permissions/[type] 

Assigns the given permission to this user. `type` should be `super`,
`eval`, or `session`.

@(delete-user-permission)

### DELETE /user/[name]/permissions/[type] 

Revokes the given permission for this user.

@(get-user-access)

### GET /users/[name]/access 

Retrieve the `read`/`write` access for a user. This returns a result
set, each element of which has a `read`, `write`, `catalog`, and
`repository` component. The first two are booleans, the latter two
strings. For permissions granted globally, `catalog` and `repository`
will have a value of `"*"`, for those granted per-catalog, only
`repository` will be `"*"`. `catalog` normally contains the catalog
name, but for the root catalog `"/"` is used.

For example, read access to all repositories in the `public` catalog
is specified (in JSON format) by:

    {read: true, write: false, catalog: "public, repository: "*"}

Whereas read/write access to repository `scratch` in the root catalog
would be:

    {read: true, write: true, catalog: "/", repository: "scratch"}

@(get-user-effective-access)

### GET /users/[name]/effectiveAccess 

As [above](#get-user-access), but also includes the access granted to
roles that this user has.

@(put-user-access)

### PUT /users/[name]/access 

This is used to grant `read`/`write` access to a user. It takes four
parameters:

`read`
: Whether to grant `read` access. A boolean, defaults to false.

`write`
: Whether to grant `write` access. Boolean, defaults to false.

`catalog`
: Which catalog to grant the access on. Leave off or pass `*` to grant
  access on all catalogs. Again, use `/` for the root catalog.

`repository`
: Specifies the repository that access is granted on. Passing `*`, or
  leaving the parameter off, means all repositories in the given
  catalog.

This request grants the user `testuser` read access to all
repositories in the root catalog:

    PUT /users/testuser/access?read=true&catalog=%2f HTTP/1.1

@(delete-user-access)

### DELETE /users/[name]/access 

Takes the same parameters as [`PUT`](#put-user-access) on this URL,
but revokes the access instead of granting it.

@(get-user-data)

### GET /users/[name]/data 

Each user has a simple key-value store associated with it. This is
mostly used by WebView to save some settings, but can be useful in
other applications.

This service returns a result set containing `id` and `uri` fields,
listing the keys stored for this user, and the URL under which their
data can be found (see [below](#get-user-data-key)).

@(get-user-data-key)

### GET /users/[name]/data/[key] 

Fetches the user-data under `key`. Returns a string.

@(put-user-data-key)

### PUT /users/[name]/data/[key] 

Stores data in a user's key-value store. The request body should
contain the data to store.

@(delete-user-data-key)

### DELETE /users/[name]/data/[key] 

Deletes data from a user's key-value store.

@(get-user-security-filters)

### GET /users/[name]/security-filters/[type] 

Get list of security filters for a user.

`type`
: `allow` or `disallow`

Items returned have keys `s`, `p`, `o`, and `s` per the parameters for
[POST security-filters](#post-user-security-filters).

@(post-user-security-filters)

### POST /users/[name]/security-filters/[type] 

Create filter for the user.

`type`
: `allow` or `disallow`

Parameters are all optional:

`s`
: Subject

`o`
: Object

`p`
: Predicate

`g`
: Graph

See also [roles/security-filters](#post-role-security-filters).
and [Security filters Documentation](security.html#filters).

@(delete-user-security-filters)

### DELETE /users/[name]/security-filters/[type] 

Delete filter for the user.

The `type` and parameters (`s`, `p`, `o`, and `s`) are the same as
for [POST security-filters](#post-user-security-filters).

@(get-user-suspended)

### GET /users/[name]/suspended 

Returns a boolean indicating whether the user's account is suspended.
All accounts start as unsuspended. They can be suspended explicitly by
a superuser, in which case the account is suspended until explicitly
unsuspended by a superuser. Accounts may also be suspended because of
too many consecutive failed logins if the configuration option
[`MaxFailedLogins`](daemon-config.html#MaxFailedLogins) is set
appropriately. Accounts suspended for that reason can be unsuspended
by a superuser but also may be unsuspended automatically after a
period of time if the configuration option
[`AccountUnsuspendTimeout`](daemon-config.html#AccountUnsuspendTimeout)
is set appropriately. Suspended users cannot log in.

@(post-user-suspended)

### POST /users/[name]/suspended 

Suspends the user's account.

@(delete-user-suspended)

### DELETE /users/[name]/suspended 

Unsuspends the user's account.

@(get-user-enabled)

### GET /users/[name]/enabled 

Returns a boolean indicating whether the user's account is enabled.
All accounts start as enabled and they stay enabled until disabled
explicitly by superuser.

@(post-user-enabled)

### POST /users/[name]/enabled 

Enables the user's account.

@(delete-user-enabled)

### DELETE /users/[name]/enabled 

Disables the user's account.

@(get-roles)

### GET /roles 

Returns the names of all roles that have been defined.

@(put-role)

### PUT /roles/[role] 

Creates a new role.

@(delete-role)

### DELETE /roles/[role] 

Deletes a role. Any users that have been assigned this role will lose
it.

@(get-role-permissions)

### GET /roles/[role]/permissions 

Lists the permission flags granted to a role.

@(put-role-permission)

### PUT /roles/[role]/permissions/[type] 

Grant a role a certain permission. `type` should be `super`, `eval`,
or `session`.

@(delete-role-permission)

### DELETE /roles/[role]/permissions/[type] 

Revoke a permission for a role.

@(get-role-access)

### GET /roles/[role]/access 

Query the access granted to a role. Returns a result in the same
format as the [equivalent](#get-user-access) service for users.

@(put-role-access)

### PUT /roles/[role]/access 

Grant `read`/`write` access to a role. See [here](#put-user-access)
for the parameters that are expected.

@(delete-role-access)

### DELETE /roles/[role]/access 

Revoke `read`/`write` access for a role. Accepts the same parameters
as above.

@(get-role-security-filters)

### GET /roles/[role]/security-filters/[type] 

Get list of security filters for a role.

Same parameters as [user/security-filters](#get-user-security-filters).

@(post-role-security-filters)

### POST /roles/[role]/security-filters/[type] 

Create filter for the role.

Same parameters as [user/security-filters](#post-user-security-filters).

@(delete-role-security-filters)

### DELETE /roles/[role]/security-filters/[type] 

Delete filter for the role.

Same parameters as
[user/security-filters](#delete-user-security-filters)
and [POST role/security-filters](#post-role-security-filters).

@(catalog)

## Catalog interface

@(get-protocol)

### GET /protocol 

Returns the protocol version of the [Sesame][seshttp] interface, as an
integer. The protocol described in this document is `4`.

@(get-repositories)

### GET /repositories 

Lists the repositories in this catalog. The result is a set of tuples
containing `id` (the name of the repository) and `uri` (a link to the
repository) fields. The fields `readable` and `writable` indicate
whether your user has read and write access to the repository.
Finally, there is the `title` field, which exists for Sesame
compatibility, and contains the same value as the `id` field.

    GET /repositories HTTP/1.1
    Accept: application/json

    HTTP/1.1 200 OK
    Content-Type: application/json; charset=UTF-8

    [{"uri":"http://localhost:10035/repositories/store1",
      "id":"store1",
      "title":"store1",
      "readable":true,
      "writable":true},
     ... other stores ...]

Or, when fetching the list of repositories in a non-root catalog:

    GET /catalogs/people/repositories HTTP/1.1

@(put-repo)

### PUT /repositories/[name] 

Creates a new, empty repository. Supports several optional
configuration arguments:

`expectedSize`
: An integer, used to configure the expected size of the repository.

`index`
: Can be specified any number of times. Should hold [index
  IDs](#indexing), and is used to configure the set of indices created
  for the store.

When a repository with the given name already exists, it is
overwritten, unless a parameter `override` with value `false` is
passed.

@(delete-repo)

### DELETE /repositories/[name] 

Delete a repository. Might fail if someone else is accessing the
repository.

@(repository)

## Repository interface

@(get-post-repo)

### GET/POST /repositories/[name] 

(Note that if no `query` parameter is given, this will return the
WebView HTML page instead of the service described here.)

This URL is used to run queries against a repository. It conforms to
both the [Sesame][seshttp] and [SPARQL protocol][sparqlprot]
interfaces — this is why some of the parameter names may look
inconsistent.

[SPARQL/Update][spu] queries are allowed, but only when the request is
made using `POST` instead of `GET` (and the user has write access to
the repository).

This service takes the following parameters:

`query`
: The query to be executed. The query may use the
  [namespace](#namespaces) prefixes defined for the user.

`queryLn`
: The language of the query. Can be [`sparql`][sparql] or
  [`prolog`][prolog]. Defaults to `sparql`.

`infer` 
: A string that determines what kind of
  [reasoning](agraph-introduction.html#reasoning-intro) is used when executing
  the query. Default is `false`, no reasoning. Other options are
  `rdfs++` (same as `true`), and `restriction` for hasValue as well as
  rdf++ reasoning.

`context`
: Can be passed zero or more times. Sets the graph name, or list of
  graph names, that will be used by this query (as in `FROM`). When no
  context is given, all graphs are used. The string `null` can be used
  to refer to the default graph of the store.

`namedContext`
: Also can be given multiple times. Behaves like `context`, except
  that the named graphs retain their names (as in `FROM NAMED`).

`default-graph-uri`
: Can be passed any number of times. Works like `context` except that
  plain-URI values should be given, without wrapping `<` and `>`
  characters.

`named-graph-uri`
: Works like `default-graph-uri`, except that this specifies the named
  graphs to be used.

`limit`
: An integer. Can be used to limit the amount of results returned by
  the query.

`offset`
: An integer. Can be used to skip the first `offset` results in result
  set.

`$[varname]`
: Parameters starting with a `$` character can be used to bind query
  variables to fixed value (an N-Triples term) when executing a SPARQL
  query.

`checkVariables`
: A boolean that defaults to false, indicating whether an error should
  be raised when a SPARQL query selects variables that are not
  mentioned in the query body.

`defaultGraphName`
: Can be used to provide a resource (URL) name for the default graph.
  Any references to that resource will reference the default graph,
  and in the output the resource will be substituted for any
  references to the default graph. Can be given multiple times to have
  multiple names refer to this graph, but only the first one will
  appear in the output.

`planner`
: Can be used to control the way the query is planned {remark TODO}.

`save`
: When given, will cause the server to (as well as executing the query
  normally) save the query as a prepared query under the name passed
  as the value for this parameter. See [preparing
  queries](#preparing-queries) below.

`timeout`
: When given, it must be a positive integer which specifies the maximum query
execution time (units are seconds). If unspecified, there is no limit on
how long the query will run.

The result formats supported depends on the query. [Prolog][prolog]
queries return tabular data, as do [SPARQL][sparql] `select` queries.
`describe` or `construct` queries return triples, and `ask` queries
return a boolean value.

Prolog queries are allowed to return nested lists of results, in which
case the result can only be returned as `application/json`, and the
nested structure (both in the list of column names and in the results
themselves) will be represented as nested JSON arrays.

[sparql]: http://www.w3.org/TR/rdf-sparql-query/
[spu]: http://www.w3.org/Submission/SPARQL-Update/
[prolog]: agraph-introduction.html#prolog

@(ensure-not-lingering)

### POST /repositories/[name]/ensureNotLingering 

To conserve resources, makes the database instance and its child
processes exit if the instance is unused. Takes no arguments, returns
nothing.

Normally unused database instances linger for InstanceTimeout seconds
to speed up subsequent open operations.

@(get-size)

### GET /repositories/[name]/size 

Returns the number of statements in the repository, as an integer.
Takes a single optional argument, `context`, which can be used to
restrict the count to a single named graph. Note if the repository is
a [multi-master repository][multi-master], the returned size may be
inaccurate. See [Triple count reports may be
inaccurate](multi-master.html#triple-count) in the [Multi-master
Replication][multi-master] document.

@(get-statements)

### GET /repositories/[name]/statements 

Retrieves statements (triples) by matching against their components.
All parameters are optional — when none are given, every statement in
the store is returned.

`subj`
: Match a specific subject. When given, should be a term in N-triples
  format. Can be given multiple times to mean 'the subject must be
  one of these resources'.

`subjEnd`
: Can only be given if exactly one `subj` parameter is given. Matches
  a range of subjects.

`pred`
: Match a specific predicate. Can be passed multiple times, like `subj`,
  to match a set.

`predEnd`
: Perform a range query on the predicate.

`obj`
: Match a specific object. Pass multiple values to match a set.

`objEnd`
: Range query on objects.

`context`
: Can be given multiple times. Restricts the query to the given list of
  named graphs. When not specified, all graphs in the store are used.

`contextEnd`
: Range query on contexts / graph names.

`limit`
: An integer indicating the maximum amount of results to return.

`offset`
: An integer. Tell the server to skip a number of results before it
  starts returning.

`infer`
: Used to turn on reasoning for this query. Valid values are `false`,
  `rdfs++`, and `hasvalue`. Default is `false` — no reasoning.

@(get-post-statements-query)

### GET/POST /repositories/[name]/statements/query 

Exposes the exact same interface as [`GET
/statements`](#get-statements). Useful when you need to make a POST
request because of URL-length limitations.

@(delete-statements)

### DELETE /repositories/[name]/statements 

Deletes statements matching the given parameters. When no parameters
are given, every triple in the store is deleted. Returns the number of
triples deleted.

`subj`
: Match a specific subject. When given, should be a term in N-triples
  format.

`pred`
: Match a specific predicate.

`obj`
: Match a specific object.

`context`
: Match a specific graph name.

This deletes all statements in the graph named `"A"` (of which there
are 25).

    DELETE /repositories/repo1/statements?context=%22A%22 HTTP/1.1
    Accept: application/json

    HTTP/1.1 200 OK
    Content-Type: application/json; charset=UTF-8
    
    25

@(put-post-statements)

### PUT/POST /repositories/[name]/statements 

Add statements to a store. When the `PUT` method is used, the store is
emptied first, whereas the `POST` method just adds triples. The value
returned is an integer indicating the number of triples loaded.

The `Content-Type` header determines the way the given data is
interpreted. See the [HTTP reference](http-reference.html#backend-post/put-catalogs-repositories-statements) for
details on the supported formats.

Normally, the body of the request is used as input data. Alternatively,
one can pass a `file` parameter to indicate a (server-side) file-name
to be loaded, or a `url` parameter to load a file directly off the
web. Other supported parameters include:

`baseURI`
: When loading RDF/XML data, the value of this parameter is used as
  the base URI of the document.

`context`
: Used to set the named graph into which the new data is stored.

`commit`
: A positive integer. Will cause a commit to happen after every `N`
  added statements. Can be used to work around the fact that importing
  a huge amount of statements in a single transaction will require
  excessive amounts of memory.

`continueOnError`
: A boolean (default is false) that indicates whether the load should
  continue when malformed data is encountered. Currently only works
  for N-Triples and N-Quads data.

`externalReferences`
: A boolean (default is false) that indicates whether external references 
in RDF/XML source files will be followed. When true, the caller must have
eval permissions.

`relaxSyntax`
: A boolean (default is false).
If true, then less validation is done for the N-Triples and N-Quads formats.

See the [HTTP reference](http-reference.html#backend-post/put-catalogs-repositories-statements) for
a complete list of query parameters.

This request, where `[URL]` is the encoded form of some URL that
contains an N-triples file, loads the triples from that URL into the
`scratch` store under context `<http://example.org#test>`.

    POST /repositories/scratch/statements?url=[URL]&context=%3Chttp%3A%2F%2Fexample.org%23test%3E HTTP/1.1
    Accept: application/json

    HTTP/1.1 200 OK
    Content-Type: application/json; charset=UTF-8
    
    2530

@(preparing-queries)

### Preparing Queries

It is possible to cache the parsing and parameterization of SPARQL
queries. This is currently only recommended for very big queries that
get repeated a lot, since the savings are not very large.

Preparing queries is only supported in a dedicated
[session](#sessions), and the prepared queries will only be available
in that session.

@(get-post-prepared)

#### GET/POST /repositories/[name]/queries/[id] 

Executes a prepared query. Supports the `limit`, `offset`, and
bound-variable (`$[varname]`) parameters in the same way as the
[regular query interface](#get-post-repo), and takes all the other
parameters from the prepared query stored under the name `id` (either
through the `save` argument to a regular query, or a `PUT`
[request](#put-prepared) to this URL.

@(put-prepared)

#### PUT /repositories/[name]/queries/[id] 

Prepares a query. Accepts the `query`, `infer`, `context`,
`namedContext`, `default-graph-uri`, `named-graph-uri`,
`checkVariables`, `defaultGraphName`, and `planner` arguments in the
same way that the [regular query interface](#get-post-repo) accepts
them, but instead of executing the query, it prepares it and saves it
under `id`.

@(delete-prepared)

#### DELETE /repositories/[name]/queries/[id] 

Deletes the prepared query stored under `id`.

@(rdftransaction)

### RDF-Transaction data format

The `application/x-rdftransaction` mime type, as accepted by the
[/statements](#put-post-statements) service, is not standardized or
even widely documented, so we quickly describe it here. The format
originates from the Sesame HTTP protocol.

Documents of this type are XML documents containing a number of triple
additions and removals. They are executed as a transaction - either
completely, or not at all. (Though note that this does not mean an
implicit commit is executed on [dedicated session](#sessions).)

An RDF transaction document looks roughly like this:

    <transaction>
      <add>
        <bnode>person4</bnode>
        <uri>http://www.w3.org/1999/02/22-rdf-syntax-ns#type</uri>
        <uri>http://franz.com/simple#person</uri>
      </add>
      <add>
        <bnode>person4</bnode>
        <uri>http://franz.com/simple#birth</uri>
        <literal datatype="http://www.w3.org/2001/XMLSchema#date">1917-05-29</literal>
      </add>
      <remove>
        <null/>
        <uri>http://franz.com/simple#first-name</uri>
        <null/>
      </remove>
      <clear>
        <uri>http://franz.com/simple#context1</uri>
      </clear>
    </transaction>

A transaction's root tag is always `transaction`. Inside of this, any
amount of actions are specified, which are executed in the order in
which they are given.

The `add` action adds a triple. It should contain at least three
nodes, which specify the subject, predicate, and object of the triple.
After that, any number of nodes may follow, which specify contexts
that the triple should be added to. A `null` tag can be used to
specify the default context. If no contexts are given, the triple is
inserted into only the default context.

These child nodes can be either an `uri` tag containing a resource's
URI, a `bnode` tag containing an ID that is used to be able to refer
to the same blank node multiple times in the document, or a `literal`
tag, that contains a string. `literal` tags may have `datatype` or
`xml:lang` attributes to assign them a type or a language.

In a `remove` tag, the first three child nodes optionally specify the
subject, predicate, and object of the triples to remove. Any of these
can be given as a `null` tag (or left out altogether) to count as a
wild-card. After these, any number of nodes can follow, which specify
the contexts to remove nodes from. If none are given, nodes are
removed from all contexts. A `null` tag is used to specify the default
context here. `removeFromNamedContext` works the same, but requires a
single context to be specified.

`clear` also removes triples, but without the option to specify
subject, predicate, or object. All child nodes are interpreted as
contexts. Again, not specifying any contexts causes nodes to be
removed from all contexts.

@(post-statements-delete)

### POST /repositories/[name]/statements/delete 

Used to delete a set of statements. Expects a JSON-encoded array of
triples as the posted data, and deletes all statements listed in
there. `Content-Type` should be `application/json`.

When an `ids` parameter with the value `true` is passed, the request
body should contain a JSON-encoded list of triple-ids, instead of
actual triples.

@(get-statements-id)

### GET /repositories/[name]/statements/id 

Fetches a set of statements by ID. Takes any number of `id`
parameters, and returns a set of triples.

@(get-post-unique)

### GET/POST /repositories/[name]/unique/[column] 

Find the set of unique terms in a column. `column` can be one of
`obj`, `pred`, `subj`, or `context`. Without arguments, it simply
finds the set of all terms that occur in that column in the database.
The query can be further refined by passing optional `obj`, `pred`,
`subj`, or `context` parameters, which, when given a term, restrict
the result to only triples that contain that term in that position.
For example, to get all outgoing predicates from term
`<http://example.com>`, query `/unique/pred` with the parameter `subj`
set to `<http://example.com>`.

Returns a set of terms.

@(get-statements-duplicates)

### GET /repositories/[name]/statements/duplicates 

Gets all duplicate statements that are currently present in the
store. The `mode` parameter can be either `spog` (the default) or
`spo` to indicate which components of each triple must be equivalent
to count as duplicates of each other. See [Deleting Duplicate
Triples][deleting-duplicates].

@(delete-statements-duplicates)

### DELETE /repositories/[name]/statements/duplicates 

Deletes all duplicate statements that are currently present in the
store. The `mode` parameter can be either `spog` (the default) or
`spo` to indicate which components of each triple must be equivalent
to count as duplicates of each other. See [Deleting Duplicate
Triples][deleting-duplicates]

@(get-suppress-duplicates)

### GET /repositories/[name]/suppressDuplicates 

Returns the duplicate suppression strategy currently active in the
store. This returns either `false` if no duplicate suppression is
active, or `spog` if it is active. See [Deleting Duplicate
Triples][deleting-duplicates].

@(put-suppress-duplicates)

### PUT /repositories/[name]/suppressDuplicates 

Sets the duplicate suppression strategy for the store. The `type`
argument can be either `false` (disable duplicate suppression), `spo`
(enable it, eliminate all spo duplicates on commit) or `spog` (enable
it, eliminate all spog duplicates on commit). See [Deleting Duplicate
Triples][deleting-duplicates].

@(delete-suppress-duplicates)

### DELETE /repositories/[name]/suppressDuplicates 

Disable duplicate suppression for the store. This is the equivalent of
using [PUT /repositories/(name)/suppressDuplicates](#put-suppress-duplicates)
with `false` as the `type` argument. See [Deleting Duplicate
Triples][deleting-duplicates].

@(get-contexts)

### GET /repositories/[name]/contexts 

Fetches a list of named graphs in the store. Returns a set of tuples,
each of which only has a `contextID` field, which is an N-triples
string that names the graph.

    GET /catalogs/people/repositories/repo1/contexts HTTP/1.1
    Accept: application/sparql-results+xml

    HTTP/1.1 200 OK
    Content-Type: application/sparql-results+xml; charset=UTF-8
    
    <?xml version="1.0"?>
    <sparql xmlns="http://www.w3.org/2005/sparql-results#">
      <head><variable name="contextID"/></head>
      <results>
        <result>
          <binding name="contextID">
            <literal>A</literal>
          </binding>
        </result>
      </results>
    </sparql>  

@(post-functor)

### POST /repositories/[name]/functor 

Define Prolog functors, which can be used in Prolog queries. This is
only allowed when accessing a [dedicated session](#sessions).

The body of the request should hold the definition for one or more
Prolog functors, in [Lisp syntax](agraph-introduction.html#prolog),
using the `<--` or `<-` operators.

@(post-commit)

### POST /repositories/[name]/commit 

@(post-begin)

### POST /repositories/[name]/begin 

Begin a new transaction. It is an error if there is already an active
transaction (*400 Bad Request* is returned with message *NESTED
TRANSACTION Cannot begin a new transaction while there is one already
active*). This request is only meaningful in [dedicated
sessions](#sessions) and with Sesame 2.7 transaction handling
semantics. In shared back-ends or with Sesame 2.6 semantics, it does
nothing.


### POST /repositories/[name]/commit @(post-commit)

Commit the current transaction. Only meaningful in [dedicated
sessions](#sessions).

@(post-rollback)

### POST /repositories/[name]/rollback 

Roll back the current transaction (discard all changes made since the
beginning of the transaction).
Only meaningful in [dedicated sessions](#sessions).

@(post-eval)

### POST /repositories/[name]/eval 

Evaluates the request body in the server. By default, it is evaluated
as Common Lisp code, with `*package*` set to the `db.agraph.user`
package. If you specify a `Content-Type` of `text/javascript`,
however, the code will be interpreted as JavaScript.

Makes an attempt to return the result in a sensible format, falling
back to printing it (as per [prin1][prin1]) and returning it as a
string.

[prin1]: http://franz.com/support/documentation/6.2/ansicl/dictentr/writepri.htm

@(get-post-freetext)

### GET/POST /repositories/[name]/freetext 

Perform a query on the free-text indices of the store, if any. A list
of matching triples is returned.

`pattern`
: The text to search for. Either this or `expression` should be
  passed. Putting multiple words in this argument means 'match only
  triples with all these words'. Double-quoting a part of the string
  means 'only triples where this exact string occurs'. Non-quoted
  words may contain wildcards - `*` (matches any string) and `?`
  (matches any single character). Or they can end in `~` to do a fuzzy
  search, optionally followed by a decimal number indicating the
  maximum [Levenshtein distance][lev] to match. A vertical bar (`|`)
  can be used between patterns to mean 'documents matching one of
  these patterns', and parentheses can be used to group sub-patterns.
  For example: `"common lisp" (programming | develop*)`.

`expression`
: An S-expression combining search strings using `and`, `or`,
  `phrase`, `match`, and `fuzzy`. For example `(and (phrase "common
  lisp") (or "programming" (match "develop*")))`.

`index`
: An optional parameter that restricts the search to a specific
  free-text index. If not given, all available indices are used.

`sorted`
: A boolean indicating whether the results should be sorted by
  relevance. Default is false.

`limit`
: An integer limiting the amount of results that can be returned.

`offset`
: An integer telling the server to skip the first few results.

    GET /repositories/repo1/freetext?pattern=RDF HTTP/1.1
    Accept: text/plain

    HTTP/1.1 200 OK
    Content-Type: text/plain; charset=UTF-8
    
    <http://example.com/node1> <http://example.com/name> "AGraph RDF store".
    .... others ....

[lev]: http://en.wikipedia.org/wiki/Levenshtein_distance

@(get-freetext-indices)

### GET /repositories/[name]/freetext/indices 

Returns a list of names of free-text indices defined in this
repository.

@(get-freetext-index)

### GET /repositories/[name]/freetext/indices/[index] 

Only returns `application/json` responses. Returns the configuration
parameters of the named free-text index. This will be an object with
the following fields:

`predicates`
: An array of strings. Empty if the index indexes all predicates,
  containing only the predicates that are indices otherwise.

`indexLiterals`
: Can be `true` (index all literals), `false` (no literals), or an array of
  literal types to index.

`indexResources`
: Can be `true` (index resources fully), `false` (don't index
  resources), or the string `"short"` to index only the part after the
  last `#` or `/` in the resource.

`indexFields`
: An array containing any of the strings `"subject"`, `"predicate"`,
  `"object"`, and `"graph"`. This indicates which fields of a triple
  are indexed.

`minimumWordSize`
: An integer, indicating the minimum size a word must have to be
  indexed.

`stopWords`
: A list of words, indicating the words that count as stop-words, and
  should not be indexed.

`wordFilters`
: A list of word filters configured for this index (see
  [below](#put-freetext-index)).

`innerChars`
: A list of character specifiers configured for this index (see [below](#put-freetext-index)).

`borderChars`
: A list of character specifiers configured for this index.

`tokenizer`
: The name of the tokenizer being used (currently either `default` or
  `japanese`).
  
@(get-freetext-param)

### GET /repositories/[name]/freetext/indices/[index]/[param] 

If `[param]` is one of the slot values mentioned
[above](#get-freetext-index), the corresponding configuration
parameter of the index is returned.

@(put-freetext-index)

### PUT /repositories/[name]/freetext/indices/[index] 

Create a new free-text index. Takes the following parameters:

`predicate`
: Can be specified multiple times. Indicates the predicates that
  should be indexed. When not given, all predicates are indexed.

`indexLiterals`
: A boolean (defaults to true) that determines whether literal are
  indexed.

`indexLiteralType`
: When `indexLiterals` is true, this parameter can be given any number
  of times to restrict the types of literals that are indexed. When
  not given, all literals (also untyped ones) are indexed.

`indexResources`
: Can be given the values `true`, `false`, or `short`. Default is
  `false`. `short` means to index only the part of the resource after
  the last `#` or `/` character.

`indexField`
: May be specified multiple times, must be one of `subject`, `object`,
  `predicate`, or `graph`. Determines which fields of a triple to
  index. Defaults to just `object`.

`minimumWordSize`
: An integer. Determines the minimum size a word must have to be
  indexed.

`stopWord`
: Can be passed multiple times. Determines the set of stop-words,
  words that are not indexed. Defaults to a small set of common
  English words. To override this default and specify that no
  stop-words should be used, pass this parameter once, with an empty
  value.

`wordFilter`
: Specify a word filter, which is an operation applied to words before
  they are indexed and before they are searched for. Used to
  'normalize' words. Can be passed multiple times to specify multiple
  filters. Currently the only valid values are `stem.english` (a
  simple English-language stemmer), `drop-accents` (will turn 'é'
  into 'e', etc.), and `soundex`, for the [Soundex][sndx] algorithm.

`innerChars`
: Can be passed multiple times. The character set to be used as the
  constituent characters of a word. Each parameter is part of a character set,
  and can be one of the following:
    * The word `alpha` - all (unicode) alphabetic characters
    * `digit` - all base-10 digits
    * `alphanumeric` - all digits and alphabetic characters
    * a single character
    * a range of characters: a single character, followed by a dash (`-`)
      character, followed by another single character.

`borderChars`
: Can be passed multiple times. The character set to be used as the
  border characters of indexed words. Uses the same syntax as `innerChars`.

`tokenizer`
: An optional string. Can be either `default` or `japanese`. When
  `japanese` is passed, the tokenizer is based on morphological
  analysis, and the `innerChars` and `borderChars` parameters are
  ignored. For `japanese`, it is also recommended to set
  `minimumWordSize` to either 1 or 2.


[sndx]: http://en.wikipedia.org/wiki/Soundex

@(post-freetext-index)

### POST /repositories/[name]/freetext/indices/[index] 

This can be use to reconfigure a free-text index. It takes the all the
parameters that the [PUT](#put-freetext-index) service takes.
Parameters not specified are left at their old values. To indicate
that the `predicate`, `indexLiteralType`, `indexField`, `stopWord`, or
`wordFilter` parameters should be set to the empty set instead of left
at their default, pass these parameters once, with the empty string as
value.

The parameter `reIndex`, a boolean which defaults to true, the client
can control whether a full re-indexing of the modified index should
take place, or whether the new settings should be used when indexing
triples added after the redefinition.

@(delete-freetext-index)

### DELETE /repositories/[name]/freetext/indices/[index] 

Delete the named index from the repository.

@(post-blanknodes)

### POST /repositories/[name]/blankNodes 

Ask the server to allocate and return a set of blank nodes. Takes one
argument, `amount`, which should be an integer.

These nodes can, in principle, be used to refer to nodes when using
other services. Note, however, that a lot of the standards related to
RDF give blank nodes a document-wide scope, which means that referring
to blank nodes by name from, for example, a SPARQL query or N-Triples
document is not possible. The nodes are interpreted as local to the
document, and assigned to a *new* blank node.

    POST /repositories/repo1/blankNodes?amount=2 HTTP/1.1
    Accept: text/plain

    HTTP/1.1 200 OK
    Content-Type: text/plain; charset=UTF-8
    
    _:s1x49c10bbc
    _:s2x49c10bbc

@(get-triplecache)

### GET /repositories/[name]/tripleCache 

Find out whether the 'SPOGI cache' {remark TODO} is enabled, and what
size it has. Returns an integer — 0 when the cache is disabled, the
size of the cache otherwise.

@(put-triplecache)

### PUT /repositories/[name]/tripleCache 

Enable the `spogi` cache in this repository. Takes an optional `size`
argument to set the size of the cache.

@(delete-triplecache)

### DELETE /repositories/[name]/tripleCache 

Disable the `spogi` cache for this repository.

@(get-no-commit)

### GET /repositories/[name]/noCommit 

Returns a boolean that tells you whether this repository is currently
in no-commit mode. When this mode is active, all commits from any
clients will return an error, effectively preventing writing to the
store. This is mostly useful for [warm standby](#warmstandby) clients,
but can also be used to enforce read-only stores in other situations.

@(put-delete-no-commit)

### PUT/DELETE /repositories/[name]/noCommit 

Turns no-commit mode on (PUT) or off (DELETE).

@(get-bulkmode)

### GET /repositories/[name]/bulkMode 

Returns a boolean indicating whether bulk-load mode is enabled for the
repository.

@(put-delete-bulkmode)

### PUT/DELETE /repositories/[name]/bulkMode 

Turn bulk-load mode on (PUT) or off (DELETE).

@(namespaces)

## Namespaces 

In order to make queries shorter and more readable, a user can define
namespaces, which will be used for queries issued by this user.

@(get-namespaces)

### GET /repositories/[name]/namespaces 

List the currently active namespaces for your user, as tuples with
`prefix` and `namespace` (the URI) fields. For example:

    GET /catalogs/scratch/repositories/repo2/namespaces HTTP/1.1
    Accept: application/json

    HTTP/1.1 200 OK
    Content-Type: application/json; charset=UTF-8
    
    [{"prefix":"rdf","namespace":"http://www.w3.org/1999/02/22-rdf-syntax-ns#"},
     {"prefix":"owl","namespace":"http://www.w3.org/2002/07/owl#"},
     ... etc ...]

@(delete-namespaces)

### DELETE /repositories/[name]/namespaces 

Deletes all namespaces in this repository for the current user. If a
`reset` argument of `true` is passed, the user's namespaces are reset
to the default set of namespaces.

@(get-namespace)

### GET /repositories/[name]/namespaces/[prefix] 

Returns the namespace URI defined for the given prefix.

@(put-post-namespace)

### PUT/POST /repositories/[name]/namespaces/[prefix] 

Create a new namespace. The body of the request should contain the URI
for the namespace, as plain text, as in:

    POST /catalogs/scratch/repositories/repo2/namespaces/ex HTTP/1.1
    Content-Type: text/plain; charset=UTF-8
    
    http://www.example.com/

@(delete-namespace)

### DELETE /repositories/[name]/namespaces/[prefix] 

Delete a namespace.

@(mapping)

## Type mappings

AllegroGraph supports storing some types of literals in encoded,
binary form. This typically makes them smaller (less disk usage), and
makes it possible to run range queries against them.  For more
details, see [Datatypes][datatypes] and the Lisp reference for
[Data-type and Predicate Mapping][ref-type-mapping].

[ref-type-mapping]: lisp-reference.html#ref-type-mapping

Specifying which literals should be encoded can be done in two ways.
There is 'datatype mapping', where a literal type is marked, and all
literals of that type are encoded, and there is 'predicate mapping',
where the objects in a statement with a given predicate are encoded.

When specifying a mapping, one has to choose an encoding to apply. To
identify these encodings, we use XSD datatypes:

* Integers

    * 8-bit: `<http://www.w3.org/2001/XMLSchema#byte>`
    * 16-bit: `<http://www.w3.org/2001/XMLSchema#short>`
    * 32-bit: `<http://www.w3.org/2001/XMLSchema#int>`
    * 64-bit: `<http://www.w3.org/2001/XMLSchema#long>`

* Unsigned Integers

    * 8-bit: `<http://www.w3.org/2001/XMLSchema#unsignedByte>`
    * 16-bit: `<http://www.w3.org/2001/XMLSchema#unsignedShort>`
    * 32-bit: `<http://www.w3.org/2001/XMLSchema#unsignedInt>`
    * 64-bit: `<http://www.w3.org/2001/XMLSchema#unsignedLong>`

* Floating point

    * single-precision: `<http://www.w3.org/2001/XMLSchema#float>`
    * double-precision: `<http://www.w3.org/2001/XMLSchema#double>`

* Times and Dates

    * times: `<http://www.w3.org/2001/XMLSchema#time>`
    * dates: `<http://www.w3.org/2001/XMLSchema#date>`
    * date-times: `<http://www.w3.org/2001/XMLSchema#dateTime>`

* Geospatial 

    Geospatial types (including cartesian, spherical and n-Dimensional)
    can be defined in this way. In each case, the datatype must be
    specified using its URL. E.g., the 10x10 cartesian mapping with
    resolution 1 would use the URL:

        <http://franz.com/ns/allegrograph/3.0/geospatial/cartesian/0.0/10.0/0.0/10.0/1.0>

Typed literals of these types will be encoded by default. For other
types, you have to specify your mapping before you import your data to
have the encoding take place.

[iso8601]: http://en.wikipedia.org/wiki/ISO_8601

@(get-mapping)

### GET /repositories/[name]/mapping 

Fetches a result set of currently specified mappings. Each row has a
`kind` (`datatype` or `predicate`), `part` (the resource associated
with the mapping), and `encoding` fields.

@(delete-mapping)

### DELETE /repositories/[name]/mapping 

Clear all non-automatic type mappings for this repository.

@(delete-all-mapping)

### DELETE /repositories/[name]/mapping/all 

Clear all type mappings for this repository *including* the automatic
ones.

@(get-typemapping)

### GET /repositories/[name]/mapping/type 

Yields a list of literal types for which datatype mappings have been
defined in this store.

    GET /repositories/test/mapping/type HTTP/1.1

    HTTP/1.1 200 OK
    Content-Type: text/plain; charset=UTF-8
    
    <http://www.example.com/myInteger>
    <http://www.w3.org/2001/XMLSchema#unsignedShort>
    <http://www.w3.org/2001/XMLSchema#dateTime>
    ... etc ...

@(post-put-typemapping)

### PUT/POST /repositories/[name]/mapping/type 

Takes two arguments, `type` (the RDF literal type) and
`encoding`, and defines a datatype mapping from the first to the
second. For example, if `[TYPE]` is the URL-encoded form of
`<http://www.example.com/myInteger>`, and `[ENC]` of
`<http://www.w3.org/2001/XMLSchema#int>`, this request will cause
`myInteger` literals to be encoded as integers:

    PUT /repositories/test/mapping/type?type=[TYPE]&encoding=[ENC] HTTP/1.1

@(delete-typemapping)

### DELETE /repositories/[name]/mapping/type 

Deletes a datatype mapping. Takes one parameter, `type`, which should
be an RDF resource.

@(get-predmapping)

### GET /repositories/[name]/mapping/predicate 

Yields a list of literal types for which predicate mappings have been
defined in this store.

@(post-put-predmapping)

### PUT/POST /repositories/[name]/mapping/predicate 

Takes two arguments, `predicate` and `encoding`, and defines a
predicate mapping on them.

@(delete-predmapping)

### DELETE /repositories/[name]/mapping/predicate 

Deletes a predicate mapping. Takes one parameter, `predicate`.

@(indexing)

## Indexing

Triple stores can be equipped with a variety of indices, which will
affect query performance. By default, a store gets a sensible set of
indices, but it is possible to tweak this set.

Indices are identified by cryptic IDs, such as `spogi`, which stands
for "subject, predicate, object, graph, id", the order in which the
fields of triples are used when sorting for that index.

@(get-indices)

### GET /repositories/[name]/indices 

Returns a list of index IDs that are enabled for this store. When a
`listValid=true` parameter is passed, a list of all supported index
types is returned.

@(put-index)

### PUT /repositories/[name]/indices/[type] 

Ensures that the index indicated by `type` is present in this
store. Takes effect at commit time (which is, of course, immediately
when using a shared back-end or an auto-commit session).

@(delete-index)

### DELETE /repositories/[name]/indices/[type] 

Removes the index indicated by `type` from the store. Also takes
effect at commit time.

@(post-indices-optimize)

### POST /repositories/[name]/indices/optimize 

Tells the server to try to optimize the indices for this store. The
arguments are `wait`, `level`, and `index`. All are optional. Here is
a sample call:

    POST /repositories/myrepo/indices/optimize?wait=false&level=1&index&spogi&index=gposi

 * POST /repositories/[name]/indices/optimize?wait=[true or false]

    `wait` defaults to false. The value true indicates
    the HTTP request should wait for the operation to complete
    rather than returning right away, which is what happens when
    wait is false.

 * POST /repositories/[name]/indices/optimize?level=[0 or 1 or 2]

    `level` specifies how much optimization work should be done, with 0
    being the least and 2 (which is the default) being the most (see
    [Triple Indices][triple-index]).

 * POST /repositories/[name]/indices/optimize?index=[index1 name]&index=[index2 name]...

    `index` specifies an index to be optimized. Index names are
    combinations of `s`, `p`, `o`, `g`, and `i` (see [Triple Indices][triple-index]).
    This command will not create new
    indices, so only existing indices should be specified. Specifying no
    `index` means optimize all indices. `index` may appear as many times
    as desired.


@(geospatial)

## Geo-spatial queries

When literals are encoded as geo-spatial values, it is possible to
efficiently perform geometric queries on them.

In order to do this, one defines a geo-spatial datatype, and then adds
literals of that type to the store. AllegroGraph supports two kinds of
geo-spatial datatypes, cartesian and spherical. A cartesian literal
looks like this:

    "+10.0-17.5"^^<[cartesian type]>

Where the numbers are the `X` and `Y` coordinates of the point. A
spherical literal uses [ISO 6709][6709] notation, for example:

    "+37.73+122.22"^^<[spherical type]>

[6709]: http://en.wikipedia.org/wiki/ISO_6709

@(get-geotypes)

### GET /repositories/[name]/geo/types 

Retrieve a list of geospatial types defined in the store.

@(put-geotype-cartesian)

### POST /repositories/[name]/geo/types/cartesian 

Define a new Cartesian geospatial type. Returns the type resource,
which can be used as the `type` argument in the services below.

`stripWidth`
: A floating-point number that determines the granularity {remark
  TODO} of the type.

`xmin`, `xmax`, `ymin`, `ymax`
: Floating-point numbers that determine the size of the Cartesian
  plane that is modelled by this type.

@(put-geotype-spherical)

### POST /repositories/[name]/geo/types/spherical 

Add a spherical geospatial type. Returns the type resource.

`stripWidth`
: A floating-point number that determines the granularity of
  the type.

`unit`
: Can be `degree`, `radian`, `km`, or `mile`. Determines the unit in
  which the `stripWidth` argument is given. Defaults to `degree`.

`latmin`, `longmin`, `latmax`, `longmax`
: Optional. Can be used to limit the size of the region modelled by
  this type. Default is to span the whole sphere.

For example, this defines a type with a granularity of 2 degrees:

    POST /repositories/repo1/geo/types/spherical?stripWidth=2 HTTP/1.1
    Accept: text/plain

    HTTP/1.1 200 OK
    Content-Type: text/plain; charset=UTF-8
    
    <http://franz.com/ns/allegrograph/3.0/geospatial/spherical/degrees/
       -180.0/180.0/-90.0/90.0/2.0>

(The newline in the URI wouldn't be there in the actual response.)

@(get-geo-box)

### GET /repositories/[name]/geo/box 

Fetch all triples with a given predicate whose object is a geospatial
value inside the given box.

`type`
: The geospatial type of the object field.

`predicate`
: The predicate to look for.

`xmin, ymin, xmax, ymax`
: The bounding box.

`limit`
: Optional. Used to limit the amount of returned triples.

`offset`
: Optional. Used to skip a number of returned triples.

`infer`
: Optional argument to control whether triples inferred through
  reasoning should be included. Default is `false` (no reasoning),
  other accepted values are `rdfs++` and `hasvalue`.

`useContext`
: A boolean parameter that defaults to `false`. When `true`, the
  context (graph) field of triples is used as the geospatial value to
  match, rather than the object.

@(get-geo-circle)

### GET /repositories/[name]/geo/circle 

Retrieve triples within a circle. `type`, `predicate`, `infer`,
`limit`, `offset`, and `useContext` argument as with
[/geo/box](#get-geo-box). Takes `x`, `y`, and `radius` arguments, all
floating-point numbers, to specify the circle.

@(get-geo-haversine)

### GET /repositories/[name]/geo/haversine 

Retrieve triples whose object lies within a circle in a spherical
system. Takes `type`, `predicate`, `infer`, `limit`, `offset`, and
`useContext` arguments like [/geo/box](#get-geo-box), `lat` and `long`
arguments to specify the centre of the circle, and a `radius`
argument. The unit used for `radius` defaults to kilometre, but can be
set to mile by passing a `unit` parameter with the value `mile`.

@(put-geo-polygon)

### PUT /repositories/[name]/geo/polygon 

Create a polygon in the store. Takes a parameter `resource`, which
sets the name under which the polygon should be stored, and three or
more `point` arguments, which must be geospatial literals that
represent the points of the polygon.

@(get-geo-polygon)

### GET /repositories/[name]/geo/polygon 

Retrieve triples whose object lies inside a polygon. `type`,
`predicate`, `infer`, `limit`, `offset`, and `useContext` work as with
[/geo/box](#get-geo-box). The `polygon` parameter must hold the name
of a polygon created with the [above](#put-geo-polygon) service.

@(attributes)

## Attributes

Attributes are are name/value pairs that can be associated with
triples.  See [Triple Attributes][triple-attributes] for more
information on attributes.  The HTTP interface can be used to define
attributes. An attribute must be defined before triples can be added
with that attribute and an attribute can be associated with a triple
only when it is added.

A static filter can be used to control access to triples. They can be
used to require that a user have specific attributes before that user
can see a triple. This access control is one of the important use cases
of specifying triple attributes.

The HTTP interface to attributes 

@(get-attributes)

### GET /repositories/[name]/attributes/definitions

See [GET catalogs / \[CATNAME\] / repositories / \[REPONAME\] / attributes
/ 
definitions](http-reference.html#backend-get-catalogs-repositories-attributes-definitions)
in [HTTP-Reference][http-reference].

@(post-attributes)

### POST /repositories/[name]/attributes/definitions

See [POST catalogs / \[CATNAME\] / repositories / \[REPONAME\] / attributes
/ 
definitions](http-reference.html#backend-post-catalogs-repositories-attributes-definitions)
in [HTTP-Reference][http-reference].

@(delete-attributes)

### DELETE /repositories/[name]/attributes/definitions

See [DELETE catalogs / \[CATNAME\] / repositories / \[REPONAME\] / attributes
/ 
definitions](http-reference.html#backend-delete-catalogs-repositories-attributes-definitions)
in [HTTP-Reference][http-reference].

@(get-staticfilter)

### GET /repositories/[name]/attributes/staticFilter

See [GET catalogs / \[CATNAME\] / repositories / \[REPONAME\] / attributes
/ 
staticFilter](http-reference.html#backend-get-catalogs-repositories-attributes-staticFilter)
in [HTTP-Reference][http-reference].


@(post-staticfilter)

### POST /repositories/[name]/attributes/staticFilter

See [POST catalogs / \[CATNAME\] / repositories / \[REPONAME\] / attributes
/ 
staticFilter](http-reference.html#backend-post-catalogs-repositories-attributes-staticFilter)
in [HTTP-Reference][http-reference].

@(delete-staticfilter)

### DELETE /repositories/[name]/attributes/staticFilter

See [DELETE catalogs / \[CATNAME\] / repositories / \[REPONAME\] / attributes
/ 
staticFilter](http-reference.html#backend-delete-catalogs-repositories-attributes-staticFilter)
in [HTTP-Reference][http-reference].

### GET /repositories/[name]/metadata

Returns the metadata for a repository. Metadata comprises attribute and
static filter definitions.

### POST /repositories/[name]/metadata

Merges the given metadata into the current metadata.  Changing
an attribute definition is not permitted.  A commit must
be done to make these changes persistent. The `metadata` argument
must be a string holding the metadata value. This value should have
come from a previous GET of the metadata. Metadata comprises attribute
and static filter definitions.

@(sna)

## Social network analysis

Some queries and operations are best expressed using graph-traversing
generators {remark TODO}. The following services make it possible to define
such generators.

@(put-generator)

### PUT /repositories/[name]/snaGenerators/[generator] 

Creates a new generator under the given name. Accepts the following
parameters:

`objectOf`
: A predicate. Accepted multiple times. Causes the new generator to
  follow edges with the given predicate.

`subjectOf`
: Like `objectOf`, but follow edges from object to subject.

`undirected`
: Like the above, but follow edges in both directions.

`query`
: A Prolog query, in which the variable `?node` can be used to refer
  to the 'start' node, and whose results will be used as 'resulting'
  nodes. User [namespaces](#namespaces) may be used in this query.

@(put-matrix)

### PUT /repositories/[name]/neighborMatrices/[matrix] 

Create a neighbor-matrix, which is a pre-computed generator.

`group`
: A set of N-Triples terms (can be passed multiple times) which serve
  as start nodes for building up the matrix.

`generator`
: The generator to use, by name.

`depth`
: An integer specifying the maximum depth to which to compute the
  matrix. Defaults to `1`.

@(sessions)

## Sessions

Normal requests will be handled by one of a set of shared back-end
processes. (See [Server Configuration and Control][daemon-config].)
The fact that they are shared between all incoming requests means
there are certain limitations on the way they can be used--a shared
back-end does not support transactions spanning multiple requests, and
does not allow one to define new Prolog functors. Further, though it
is possible to load scripts into shared back-ends, it is highy
recommended that you not do so. Function definitions, global
variables, and custom-services, once loaded, remain active in a shared
back-end until that backend is killed. Javascript scripts are
sandboxed for the most part and only leak custom-service definitions
into the back-end. Unless you are extremely careful about what scripts
are available to be loaded, it is possible that code you expect to run
as part of a server-side script has been overwritten by other
requests, and unexpected errors may result. A session, on the other
hand, can only be accessed by the user who requested it, and so the
scripts loaded can be carefully managed.

When transactions, functors, or other persistent state is needed, it
is necessary to [create](#post-session) a session. This spawns a
process that you will have exclusive access to. Sessions are
effectively single threaded: only one request at a time will be processed. 

Requests to a session URL, unless the `autoCommit` parameter is given
when starting the session, are handled inside a transaction. That
means modifications to the store are not visible in other sessions or
in shared back-ends until a [commit](#post-commit) request is made. A
[rollback](#post-rollback) request can be used to discard any changes
made since the beginning of the current transaction.

When making extra requests to commit and rollback is too expensive,
one can use the `x-commit` and `x-rollback` HTTP headers (with any
value) to have the rollback or commit command piggyback on another
request. `x-rollback` will cause the store to be rolled back *before*
evaluating the request, `x-commit` will cause a commit *after*
evaluating the request.

Sessions time out after a certain period of idleness (can be set on
[creation](#post-session)), so an application that depends on a
session being kept alive should periodically [ping](#get-ping) its
session.

Sessions belonging to superusers allow their owners
to use the `x-masquerade-as-user` header in HTTP requests to activate
another user's security filters.
See [user and role security-filters](#post-user-security-filters)
and [Security filters documentation](security.html#filters).


@(transaction-handling-semantics)

### Transaction handling semantics

A session can execute all kinds of requests (even those that mutate
the store) within or without transactions.

When within a transaction, database modifications are not visible in
other sessions or in shared back-ends until a [commit](#post-commit)
request is made. A [rollback](#post-rollback) request can be used to
discard any changes made since transaction started.

When there is no active transaction, each individual request is
executed as if in a separate transaction.

It's generally true that having an active transaction is equivalent to
[auto-commit](#get-autocommit) mode being off, but the details of how
the two modes are entered and exited differ depending on whether the
server is [configured][transaction-semantics-config] to operate under
Sesame 2.6 or Sesame 2.7 semantics.

With Sesame 2.6 transaction handling, if the active transaction is
rolled back or committed, a new one is started immediately.
Auto-commit mode is only ever changed by explicit request.

With Sesame 2.7 transaction handling, transactions must be started
explicitly with [begin](#post-begin). [commit](#post-commit) and
[rollback](#post-rollback) do not start a new transaction. Instead
they turn auto-commit mode on. Changing the auto-commit flag is
deprecated in favor of begin and commit. However, to maintain some
backwards compatibility, turning auto-commit off starts a new
transaction, and turning it off commits the transaction.

### Extra HTTP headers

When making explicit requests to rollback, begin, or commit is too
expensive, one can use the `x-rollback`, `x-begin` and `x-commit` HTTP
headers (with any value) to have the rollback, begin or commit command
piggyback on another request. A request may have any combination of
these extra headers. The execution semantics are as follows: before
the request is performed, if `x-rollback` is present, then the store
is rolled back. Next, if `x-begin` is present, a new transaction is
started. Then the actual request is performed and the store is
committed if `x-commit` is supplied.

@(post-session)

### POST /session 

Creates a new session. Takes the following parameters:

`autoCommit`
: A boolean, which determines whether the session starts in autocommit
  mode. With Sesame 2.6 transaction handling semantics, the default is
  `false`, meaning that the session starts as if a transaction had
  been started. With Sesame 2.7 transaction handling semantics, the
  default is `true` and an explicit [begin](#post-begin) is required.

`lifetime`
: An integer specifying the number of seconds a session can be idle
  before being terminated. Both the default and the maximum allowable
  value are determined by configuration directives, the default by
  [DefaultSessionTimeout](daemon-config.html#DefaultSessionTimeout)
  and the maximum by 
  [MaximumSessionTimeout](daemon-config.html#MaximumSessionTimeout).
  Neither of these values can be determing programmatically. Users
  should ask the database administrator for the values if needed.

`loadInitFile`
: A boolean, defaulting to `false`, which determines whether the
  [initfile](#put-initfile) is loaded into this session.

`script`
: May be specified any number of time, to load [server
  scripts](#get-sitescripts) into the new session.

`store`
: A string indicating the kind of store that has to be opened, see
  below.

The minilanguage used by the `store` parameter works as follows:

`<store1>`
: Indicates the triple store named "store1" in the root catalog.

`<catalog1:store2>`
: The triple store "store2" in the "catalog1" catalog.

`<http://somehost:10035/repositories/store3>`
: A remote store, by URL. If the URL points to the server itself, the
  store will be opened locally.

`<a> + <b>`
: The federation of stores "a" and "b".

`<a>[rdfs++]`
: The store "a", with `rdfs++` reasoning applied (`restriction` is
  also supported as a reasoner type). You can specify the context that
  inferred triples get using this syntax: `<a>[rdfs++#<http://test.org/mycontext>]`

`<a>\{null <http://example.com/graph1>\}`
: Store "a", filtered to only contain the triples in the default
  graph (`null`) and the graph named `http://example.com/graph1`.
  Any number of graphs can be given between the braces.

This syntax can be composed to created federations of filtered and
reasoning stores, for example `<http://somehost:10035/repositories/<a>\{null\} + <b>[rdfs++]`.

The service returns the URL of the new session. Any sub-URLs that were
valid under a repository's URL will also work under this session URL.
For example, if
`http://localhost:55555/sessions/7e8df8cd-26b8-26e4-4e83-0015588336ea`
is returned, you can use
`http://localhost:55555/sessions/7e8df8cd-26b8-26e4-4e83-0015588336ea/statements`
to retrieve the statements in the session.

@(post-store-session)

### POST /repositories/[name]/session 

This is a shortcut for creating a session in a local triple store. It
takes `autoCommit`, `loadInitfile`, `script`, and `lifetime` arguments
as described above, and creates a session for the store that the URL
refers to.

@(post-close-session)

### POST [session-url]/session/close 

Explicitly closes a session.

@(get-ping)

### GET [session-url]/session/ping 

Let the session know you still want to keep it alive. (Any other
request to the session will have the same effect.) 

### GET [session-url]/session/isActive @(get-isactive)

Returns a boolean indicating whether there is a currently active
transaction for this session. This is the logical complement of
[autoCommit](#get-autocommit).

@(get-autocommit)

### GET [session-url]/session/autoCommit 

Returns a boolean indicating whether auto-commit is currently active
for this session. This is the logical complement of
[isActive](#get-isactive).

@(post-autocommit)

### POST [session-url]/session/autoCommit 

Used to change the auto-commit flag for the session. Takes a single
boolean argument called `on`. If it is set to true in a transaction,
then the transaction is automatically committed. If it is set to false
outside a transaction, then a new transaction is started. Note that
with Sesame 2.7 semantics, [commit](#post-commit) and
[rollback](#post-rollback) set this flag to true.

@(post-commit)

### POST [session-url]/commit 

Commit the current transaction.  With Sesame 2.6 semantics, a new
transcation is started. With Sesame 2.7 semantics, auto-commit mode is
entered.

@(post-rollback)

### POST [session-url]/rollback 

Roll back the current transaction. With Sesame 2.6 semantics, a new
transcation is started. With Sesame 2.7 semantics, auto-commit mode is
entered.

@(get-mongoParameters)

### GET /repositories/[name]/mongoParameters 

Returns a JSON object with keys:
* `server` - server name where MongoDB is running
* `port` - port to use to communicate with MongoDB
* `database` - name of the database to use when querying MongoDB
* `collection` - name of the collection to use when querying MongoDB
* `user` - used to authenticate to the Mongo DB server

Note, the password set with [POST](#post-mongoParameters) is not returned.

@(post-mongoParameters)

### POST /repositories/[name]/mongoParameters 

Accepts the following parameters:
* `server` - server name where MongoDB is running
* `port` - port to use to communicate with MongoDB
* `database` - name of the database to use when querying MongoDB
* `collection` - name of the collection to use when querying
MongoDB, required to be non-empty
* `user` - used to authenticate to the Mongo DB server
* `password` - used to authenticate to the Mongo DB server

See also: [MongoDB interface](mongo-interface.html).

@(process)

## Process management

An AllegroGraph server consists of a group of different
operating-system processes. The following services provide a minimal
process-debugging API over HTTP. All of them are only accessible to
superusers.

@(get-processes)

### GET /processes 

Returns a list of tuples showing the processes the server currently
has running. Each row has `pid` (the OS process ID) and a `name` (the
process name) properties.

@(get-process)

### GET /processes/[id] 

Returns stack traces for the threads in the given process.

@(delete-process)

### DELETE /processes/[id] 

Kills the specified process. Obviously, you yourself are responsible
for any adverse effects this has on the functioning of the server.

@(post-telnet)

### POST /processes/[id]/telnet 

Starts a telnet server in the specified process. A random port will be
chosen for the server, which will be returned as the response. Note
that the telnet server will allow anyone to connect, creating a
something of a security concern if the server is on an open network.

@(warmstandby)

## Warm Standby

Warm standby allows a second AllegroGraph server to keep an up-to-date
copy of a repository on another server. In case the first server
fails, this copy can be made to take over its responsibilities.

Documentation on this feature is not complete yet.

@(get-warmstandby)

### GET /repositories/[name]/warmstandby 

Only supports an `application/json` accept type. Returns a
representation of the current standby status for repository.

@(put-warmstandby)

### PUT /repositories/[name]/warmstandby 

Requires `jobname`, `primary`, `primaryPort`, `user`, and `password`
parameters. Makes this repository start replicating the source store
on the server `primary`:`primaryPort`, using the given credentials to
gain access.

@(delete-warmstandby)

### DELETE /repositories/[name]/warmstandby 

Stops a replication job. This command is sent to the client.

@(post-warmstandby-switchrole)

### POST /repositories/[name]/warmstandby/switchRole 

Sent to a repository that is currently functioning as a replication
server. Causes a client (identified by the `jobname` parameter) to
take over, making this repository a client of that new server. Takes
`primary`, `primaryPort`, `user`, and `password` parameters, which
specify the server on which the client repository lives, and the user
account to use to access this server.

The `becomeClient` boolean parameter, which defaults to true,
determines whether the server will start replicating its old client.
The `enableCommit` parameter, also defaulting to true, controls
whether no-commit mode will be turned off in the client.

@(curl-more-examples)

## Some more examples using cURL

Client URL (cURL, pronounced “curl”) is a command line tool 
that enables data exchange between a device and a server through a terminal.
It can be used to communicate from a shell to an AllegroGraph server. We used 
it in the auditing examples above. Here are some more examples showing how to 
do various common things. Note that all these things can be done using
the AllegroGraph command line tool [agtool][agtool], which has a much
simpler interface.

@(creating-repo-curl)

### Creating a repo using cURL

In our example, the user is `test` and the password is `xyzzy`. This creates
a repository:

    $ curl -X PUT -u test:xyzzy "http://machine1.company.com:10035/repositories/test"

We get a list of repos (the `kennedy` already existed when the `test`
repo was added):

    $ curl -X GET -u test:xyzzy http://machine1.company.com:10035/repositories
    uri: http://machine1.franz.com:10035/repositories/kennedy
    relativeUri: repositories/kennedy
    id: kennedy
    title: kennedy
    readable: true
    writable: true
    [...]

    uri: http://machine1.company.com:10035/repositories/test
    relativeUri: repositories/test
    id: test
    title: test
    readable: true
    writable: true
    [...]

    $ 

@(adding-data-curl)

### Adding data to a repo using cURL

Now let us add some data to the `test` repo. We create an ntriples
file *mydata.nt* with these contents:

    <http://example.org#alice> <http://example.org#name> "Alice" .  
    <http://example.org#bob> <http://example.org#name> "Bob" .
    <http://example.org#alice> <http://example.org#age> "26" .  
    <http://example.org#bob> <http://example.org#age> "33" . 

This **curl** command loads the data:

    $ curl -X POST http://machine1.company.com:10035/repositories/test/statements \ 
        -u test:xyzzy  --data "@mydata.nt" --header "Content-Type: text/plain"
    4
    $ 

This one shows the data was loaded properly:
    
    $ curl -X GET http://machine1.company.com:10035/repositories/test/statements \
       -u test:xyzzy
    <http://example.org#alice> <http://example.org#name> "Alice" .
    <http://example.org#bob> <http://example.org#name> "Bob" .
    <http://example.org#alice> <http://example.org#age> "26" .
    <http://example.org#bob> <http://example.org#age> "33" .
    $ 

@(sparql-curl)

### A SPARQL query using cURL

Now, let's use **curl** to query the data. This query:

    select ?n ?age {  
      <http://example.org#alice> <http://example.org#name> ?n ;  
                                 <http://example.org#age> ?age  
    } 

return `n "Alice" age 26`. Here is a **curl** command to get those results:

    $ curl -u test:xyzzy --header 'Accept: application/json' \
    -d 'query=select ?n ?age { <http://example.org#alice> 
    <http://example.org#name> ?n ; <http://example.org#age> ?age }' \
    -d 'limit=1000' http://machine1.company.com:10035/repositories/test
    {"names":["n","age"],"values":[["\"Alice\"","\"26\""]]}
    $

Here is a similar **curl** command with the same results:

    $ curl -u test:xyzzy \
         -X POST "http://machine1.company.com:10035/repositories/test/sparql" \
         -H "Accept: application/json" \
         -H "Content-Type: application/x-www-form-urlencoded" \
         --data-urlencode "query=SELECT ?n ?age WHERE { <http://example.org#alice> <http://example.org#name> ?n ; <http://example.org#age> ?age . }"
    {"names":["n","age"],"values":[["\"Alice\"","\"26\""]]}

@(multi-master)

## Multi-master replication

The multi-master replication facility is
described in [Multi-master Replication][multi-master].

### createCluster

    PUT catalogs / [CATNAME] / repositories / [REPOSITORY] / repl / createCluster

Here is a CURL command which converts the repository `foo` in the root
catalog (since no catalog is specified). We specify a group
(`group=first`). The port is 10035.

    $ curl -X PUT  -u user:mypassword "http://machine1.franz.com:10035/repositories/foo/repl/createCluster?instanceName=fooinst&host=machine1&group=firstg&ifExists=supersede&user=user&password=mypassword&port=10035"

### growCluster

Here is a CURL command which grows the cluster just created making a
copy on host `machine2.franz.com`.


    $ curl -X PUT  -u user:mypassword "http://machine1.franz.com:10035/repositories/foo/repl/growCluster?instanceName=foobinst1&host=machine2.franz.com&name=foo&group=firstg&user=user1&password=machine2pw&port=10035"

### Other commands

* controllingInstance
* priority
* quiesce
* remove
* settings
* start
* stop
* retain
* status

All are described in the [HTTP reference][http-reference] document.




</div>
</div>

{include resources/footer.md}

[ce]: http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.11
[utf8]: http://en.wikipedia.org/wiki/UTF-8
[auth]: http://en.wikipedia.org/wiki/Basic_access_authentication
[querystring]: http://en.wikipedia.org/wiki/Query_string
[406]: http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html#sec10.4.7
[acc]: http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.1
[ae]: http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.3
[n3]: http://www.w3.org/DesignIssues/Notation3
[xmlres]: http://www.w3.org/TR/rdf-sparql-XMLres/
[json]: http://json.org/
[sparqljson]: http://www.w3.org/2001/sw/DataAccess/json-sparql/

