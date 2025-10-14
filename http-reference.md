{remark -*- indent-tabs-mode: nil; buffer-file-coding-system: utf-8-unix -*- }
{include resources/standard-header.md}
{set-property style-sheets jquery-ui.custom.min stylesheet (print print) http}
{set-property title "HTTP Reference | AllegroGraph {property agraph-version}"}
{set-property markdown-body-id "httpSummary"}

# AllegroGraph {property agraph-version} HTTP Reference

</div> 

<div id="contents">
{include resources/include-navigation.md}
{table-of-contents :start 2 :depth 3 :label "Table of Contents"}

<div id="main-content">

## Introduction

This document lists all HTTP services, along with some
documentation. See [REST/HTTP interface][http-protocol] for further
documentation.

## URL Summary

### Server based HTTP services

These services operate on the server itself. These include user and role
management, general settings and starting sessions.

{http-protocol frontend}

### Repository based HTTP services

These services operate against a particular store or session.

{http-protocol backend}

## API Reference 

### Front end

{http-documentation frontend}

### Back end 

{http-documentation backend}

</div>
</div>

{include resources/footer.md}
